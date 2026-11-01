import type { SupabaseClient } from '@supabase/supabase-js';
import { catchSupabaseErrors } from '@/lib/supabase';
import type {
	RefreshSimpleStatsCacheParams,
	BasicSessionMetricsRow,
	BiometricsMetricsRow,
	BirdAgeMetricsRow,
	EncounterAgeMetricsRow
} from '../../types';
import { buildSimpleMetricRpcParamsList } from './rpc-params';
import { runStatsCacheDbCall } from './db-call-logging';
import { fetchMetricRows } from './fetch-metric-rows';
import {
	mergeSimpleMetricRows,
	filterToTouchedPeriods,
	filterToTouchedSpecies
} from './merge-metric-rows';
import {
	writeBySpeciesRows,
	writeAllSpeciesRows,
	deadLetterAnomalies
} from './write-cache-rows';

/**
 * Populates `SimpleStatsCache` — write side for the four read-only
 * `stats_cache_*_metrics` RPCs. See this module's own CLAUDE.md for the full
 * design (narrowing rules, merge/anomaly handling, write mechanics).
 */

/** Every distinct `Sessions.visit_date` the group has, sorted ascending — the real-date domain `batchPeriodsBySessionDateSpan` indexes `day` periods into. */
async function fetchGroupSessionDates(
	supabaseClient: SupabaseClient,
	groupId: number
): Promise<string[]> {
	const rows = (await supabaseClient
		.from('Sessions')
		.select('visit_date')
		.eq('ringing_group_id', groupId)
		.order('visit_date', { ascending: true })
		.then(catchSupabaseErrors)) as { visit_date: string }[] | null;
	return (rows ?? []).map((row) => row.visit_date);
}

/** Runs one species-grouped-or-not refresh pass for one `(groupId, temporalUnit)` — see this module's CLAUDE.md for the narrowing/merge/write pipeline it drives. */
async function runSimpleStatsCacheRefreshPass(
	supabaseClient: SupabaseClient,
	{
		groupId,
		temporalUnit,
		periods,
		speciesIds,
		importJobId
	}: RefreshSimpleStatsCacheParams,
	groupBySpecies: boolean
): Promise<void> {
	const touchedPeriods = periods ?? [];
	const logContext = {
		importJobId,
		groupId,
		temporalUnit,
		groupBySpecies,
		periods,
		speciesIds
	};

	// Only `day`'s window-narrowing batching needs this; skip the query otherwise.
	// Fetched per-pass rather than once and threaded through — see this
	// module's CLAUDE.md for why that's an accepted tradeoff.
	const groupSessionDates =
		temporalUnit === 'day' && touchedPeriods.length > 0
			? await runStatsCacheDbCall(
					{ kind: 'select', table: 'Sessions' },
					logContext,
					() => fetchGroupSessionDates(supabaseClient, groupId)
				)
			: [];

	const rpcParamsList = buildSimpleMetricRpcParamsList(
		groupId,
		temporalUnit,
		touchedPeriods,
		groupSessionDates,
		groupBySpecies
	);
	if (rpcParamsList === null) {
		// Narrowing temporal unit, nothing touched this pass — nothing to refresh.
		return;
	}
	// All 4 metric RPCs are attempted even if an earlier one failed, so a
	// timeout investigation sees whether every one is slow or just one —
	// see this module's CLAUDE.md.
	const readFailures: unknown[] = [];
	let basicRows: BasicSessionMetricsRow[] = [];
	let biometricsRows: BiometricsMetricsRow[] = [];
	let birdAgeRows: BirdAgeMetricsRow[] = [];
	let encounterAgeRows: EncounterAgeMetricsRow[] = [];

	try {
		basicRows = await fetchMetricRows<BasicSessionMetricsRow>(
			supabaseClient,
			'stats_cache_basic_session_metrics',
			rpcParamsList,
			logContext
		);
	} catch (error) {
		readFailures.push(error);
	}
	try {
		biometricsRows = await fetchMetricRows<BiometricsMetricsRow>(
			supabaseClient,
			'stats_cache_biometrics_metrics',
			rpcParamsList,
			logContext
		);
	} catch (error) {
		readFailures.push(error);
	}
	try {
		birdAgeRows = await fetchMetricRows<BirdAgeMetricsRow>(
			supabaseClient,
			'stats_cache_bird_age_metrics',
			rpcParamsList,
			logContext
		);
	} catch (error) {
		readFailures.push(error);
	}
	try {
		encounterAgeRows = await fetchMetricRows<EncounterAgeMetricsRow>(
			supabaseClient,
			'stats_cache_encounter_age_metrics',
			rpcParamsList,
			logContext
		);
	} catch (error) {
		readFailures.push(error);
	}

	if (readFailures.length > 0) {
		console.error(
			`Stats-cache refresh pass aborted: ${readFailures.length}/4 metric RPCs failed to read; blocking the cache write`,
			logContext
		);
		throw readFailures[0];
	}

	const { mergedRows, anomalies } = mergeSimpleMetricRows({
		groupId,
		temporalUnit,
		groupBySpecies,
		basicRows,
		biometricsRows,
		birdAgeRows,
		encounterAgeRows
	});

	const rowsToWrite = filterToTouchedPeriods(
		mergedRows,
		temporalUnit,
		touchedPeriods
	);

	if (groupBySpecies) {
		await writeBySpeciesRows(
			supabaseClient,
			'SimpleStatsCacheBySpecies',
			filterToTouchedSpecies(rowsToWrite, speciesIds),
			logContext
		);
	} else {
		await writeAllSpeciesRows(
			supabaseClient,
			'SimpleStatsCache',
			rowsToWrite,
			logContext
		);
	}

	await deadLetterAnomalies(supabaseClient, anomalies, logContext);
}

/** Refreshes both halves of `SimpleStatsCache` for one `(groupId, temporalUnit)`, sequentially not concurrently — see this module's CLAUDE.md for why. One temporal unit per call. */
export async function refreshSimpleStatsCache(
	supabaseClient: SupabaseClient,
	params: RefreshSimpleStatsCacheParams
): Promise<void> {
	await runSimpleStatsCacheRefreshPass(supabaseClient, params, true);
	await runSimpleStatsCacheRefreshPass(supabaseClient, params, false);
}
