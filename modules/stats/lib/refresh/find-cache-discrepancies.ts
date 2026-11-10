import type { SupabaseClient } from '@supabase/supabase-js';
import type { StatsTemporalUnit } from '@/app/models/temporal-unit';
import type {
	FindStatsCacheDiscrepanciesParams,
	StatsCacheDiscrepancy,
	MergedCellKey,
	SimpleMergedCell,
	BasicSessionMetricsRow,
	BiometricsMetricsRow,
	BirdAgeMetricsRow,
	EncounterAgeMetricsRow
} from '../../types';
import { readStatsCacheRows } from '../stats-cache';
import {
	buildSimpleMetricRpcParamsList,
	SIMPLE_NARROWING_TEMPORAL_UNITS
} from './rpc-params';
import { runStatsCacheDbCall } from './db-call-logging';
import { fetchMetricRows } from './fetch-metric-rows';
import {
	mergeSimpleMetricRows,
	filterToTouchedPeriods,
	filterToTouchedSpecies,
	indexByCell
} from './merge-metric-rows';
import { fetchGroupSessionDates } from './run-refresh-pass';
import { ALL_TIME_SENTINEL_DATE } from './write-cache-rows';

/**
 * The read-only sibling of `refreshSimpleStatsCache` — see this module's own
 * CLAUDE.md for where it sits relative to the refresh pipeline and the
 * sentinel-date reversal it has to perform.
 */

/** A cached cache-table row re-keyed onto the live side's `MergedCellKey` convention. */
type KeyedCachedRow = Record<string, unknown> & MergedCellKey;

/**
 * Re-keys one row as `readStatsCacheRows` returned it onto the live side's key
 * convention. Two reversals of what the write path does: the all-time grain's
 * `0001-01-01` sentinel becomes the real `null` the metric RPCs emit (without
 * which every all-time cell would spuriously fail to match), and the
 * all-species table's absent `species_id` column becomes the explicit `null`
 * the non-species-grouped RPC calls return.
 */
function keyCachedRow(
	row: Record<string, unknown>,
	temporalUnit: StatsTemporalUnit
): KeyedCachedRow {
	const cachedTimePeriod = (row.time_period as string | null | undefined) ?? null;
	return {
		...row,
		species_id: (row.species_id as number | null | undefined) ?? null,
		time_period:
			temporalUnit === 'all-time' &&
			cachedTimePeriod === ALL_TIME_SENTINEL_DATE
				? null
				: cachedTimePeriod
	};
}

/** The metric columns a present-on-both-sides cell is diffed on — every key of a merged live cell but the two key columns. */
function metricFieldNames(liveRow: SimpleMergedCell): string[] {
	return Object.keys(liveRow).filter(
		(field) => field !== 'species_id' && field !== 'time_period'
	);
}

/** Bookkeeping columns a raw cache-table row carries that a merged live row never does — the one set of fields `isEffectivelyEmptyRow` excludes, so a cached-only presence mismatch isn't polluted by its own `id`/`group_id`/`temporal_unit` columns. */
const CACHE_ROW_BOOKKEEPING_FIELD_NAMES = new Set([
	'id',
	'group_id',
	'temporal_unit'
]);

/**
 * True when every metric field is falsy/empty — `0` for a NOT-NULL count,
 * `null` for a nullable biometric. Such a row describes a
 * touched-but-otherwise-empty period/species combo, which a materialized
 * cache legitimately omits; a presence mismatch against a row like this is
 * therefore not a real discrepancy. See this module's CLAUDE.md "Finding
 * cache discrepancies".
 */
function isEffectivelyEmptyRow(
	row: SimpleMergedCell | KeyedCachedRow
): boolean {
	return metricFieldNames(row as SimpleMergedCell)
		.filter((field) => !CACHE_ROW_BOOKKEEPING_FIELD_NAMES.has(field))
		.every((field) => {
			const value = (row as Record<string, unknown>)[field];
			return value === 0 || value === null;
		});
}

/**
 * Reads the cached side of the comparison. A narrowing temporal unit reads a
 * `fromDate`/`toDate` window spanning the requested periods — narrowing to the
 * exact set happens afterwards with the same helpers the live side uses, so
 * both sides match on identical semantics; `all-time` reads the whole cached
 * scope with no date filter at all.
 */
async function readCachedRowsForScope(
	supabaseClient: SupabaseClient,
	{
		groupId,
		temporalUnit,
		groupBySpecies,
		touchedPeriods
	}: {
		groupId: number;
		temporalUnit: StatsTemporalUnit;
		groupBySpecies: boolean;
		touchedPeriods: string[];
	}
): Promise<Record<string, unknown>[]> {
	const sortedPeriods = [...touchedPeriods].sort();
	const dateWindow =
		SIMPLE_NARROWING_TEMPORAL_UNITS.has(temporalUnit) && sortedPeriods.length > 0
			? {
					fromDate: sortedPeriods[0],
					toDate: sortedPeriods[sortedPeriods.length - 1]
				}
			: {};
	return readStatsCacheRows({
		client: supabaseClient,
		viewedGroup: { id: groupId, slug: null },
		bySpecies: groupBySpecies,
		temporalUnit,
		...dateWindow
	});
}

/**
 * Compares the live `stats_cache_*_metrics` RPC output against the
 * materialized cache table for one scope, and returns only the cells that
 * actually disagree. Purely read-only — it writes nothing, dead-letters
 * nothing, and leaves the cache exactly as it found it.
 */
export async function findSimpleStatsCacheDiscrepancies(
	supabaseClient: SupabaseClient,
	{
		groupId,
		temporalUnit,
		groupBySpecies,
		periods,
		speciesIds
	}: FindStatsCacheDiscrepanciesParams
): Promise<StatsCacheDiscrepancy[]> {
	const touchedPeriods = periods ?? [];
	const logContext = {
		groupId,
		temporalUnit,
		groupBySpecies,
		periods,
		speciesIds
	};

	// Same day-unit preflight as the write path — `buildSimpleMetricRpcParamsList`
	// batches `day` windows by real session-date span.
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
		// Narrowing temporal unit with nothing in scope — nothing to compare.
		return [];
	}

	// All 4 metric RPCs are attempted even if an earlier one failed, then the
	// first failure is rethrown — the same pattern (and the same reason)
	// `runSimpleStatsCacheRefreshPass` uses. Inline rather than extracted: this
	// is only its 2nd occurrence.
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
			`Stats-cache discrepancy check aborted: ${readFailures.length}/4 metric RPCs failed to read; cannot compare against the cache`,
			logContext
		);
		throw readFailures[0];
	}

	// `mergeSimpleMetricRows`' own anomalies (a cell missing from some but not
	// all 4 RPCs) are the refresh pipeline's dead-letter concern, not this
	// read-only comparator's — discarded deliberately.
	const { mergedRows } = mergeSimpleMetricRows({
		groupId,
		temporalUnit,
		groupBySpecies,
		basicRows,
		biometricsRows,
		birdAgeRows,
		encounterAgeRows
	});

	// Both sides are narrowed with the same two helpers, so they match on
	// identical semantics. Species narrowing applies only to the
	// species-grouped comparison, mirroring the write path: the
	// all-species-combined table has no `species_id` to narrow on at all (see
	// `RefreshSpeciesNarrowing`).
	const narrowToScope = <Row extends MergedCellKey>(rows: Row[]): Row[] => {
		const periodNarrowed = filterToTouchedPeriods(
			rows,
			temporalUnit,
			touchedPeriods
		);
		return groupBySpecies
			? filterToTouchedSpecies(periodNarrowed, speciesIds)
			: periodNarrowed;
	};

	const liveRows = narrowToScope(mergedRows);

	const cachedRows = narrowToScope(
		(
			await runStatsCacheDbCall(
				{
					kind: 'select',
					table: groupBySpecies
						? 'SimpleStatsCacheBySpecies'
						: 'SimpleStatsCache'
				},
				logContext,
				() =>
					readCachedRowsForScope(supabaseClient, {
						groupId,
						temporalUnit,
						groupBySpecies,
						touchedPeriods
					})
			)
		).map((row) => keyCachedRow(row, temporalUnit))
	);

	const liveByCell = indexByCell(liveRows);
	const cachedByCell = indexByCell(cachedRows);

	const discrepancies: StatsCacheDiscrepancy[] = [];
	for (const key of new Set([...liveByCell.keys(), ...cachedByCell.keys()])) {
		const liveRow = liveByCell.get(key) ?? null;
		const cachedRow = cachedByCell.get(key) ?? null;
		// The key came from one index or the other, so at least one side is set.
		const { species_id, time_period } = (liveRow ?? cachedRow)!;

		if (liveRow === null || cachedRow === null) {
			// A presence mismatch against an effectively-empty row isn't a real
			// discrepancy — a materialized cache legitimately omits rows with no
			// real activity.
			const presentRow = (liveRow ?? cachedRow)!;
			if (isEffectivelyEmptyRow(presentRow)) {
				continue;
			}
			// Otherwise, a presence mismatch is a discrepancy in its own right,
			// with nothing to field-diff against.
			discrepancies.push({
				species_id,
				time_period,
				cachedRow,
				liveRow,
				mismatchedFields: []
			});
			continue;
		}

		const mismatchedFields = metricFieldNames(liveRow).filter(
			(field) => cachedRow[field] !== liveRow[field as keyof SimpleMergedCell]
		);
		if (mismatchedFields.length > 0) {
			discrepancies.push({
				species_id,
				time_period,
				cachedRow,
				liveRow,
				mismatchedFields
			});
		}
	}

	return discrepancies;
}
