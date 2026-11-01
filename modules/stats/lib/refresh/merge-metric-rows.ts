import type {
	StatsTemporalUnit,
	MergedCellKey,
	SimpleMergedCell,
	FailedRefreshCacheTable,
	FailedRefreshRow,
	BasicSessionMetricsRow,
	BiometricsMetricsRow,
	BirdAgeMetricsRow,
	EncounterAgeMetricsRow
} from '../../types';
import { SIMPLE_NARROWING_TEMPORAL_UNITS } from './rpc-params';

/** Cuts a merged result back to exactly the touched periods, for a narrowing temporal unit — load-bearing for `day`'s windowed fetch, a pass-through for the exact-filtered units. See this module's CLAUDE.md. */
export function filterToTouchedPeriods<Row extends MergedCellKey>(
	mergedRows: Row[],
	temporalUnit: StatsTemporalUnit,
	touchedPeriods: string[]
): Row[] {
	if (!SIMPLE_NARROWING_TEMPORAL_UNITS.has(temporalUnit)) {
		return mergedRows;
	}
	return mergedRows.filter(
		(row) =>
			row.time_period !== null && touchedPeriods.includes(row.time_period)
	);
}

/** Cuts a species-grouped merged result back to `speciesIds`, when given (`undefined` = no narrowing) — write-only, species-grouped-pass-only narrowing, see `RefreshSpeciesNarrowing`. */
export function filterToTouchedSpecies<Row extends MergedCellKey>(
	mergedRows: Row[],
	speciesIds: number[] | undefined
): Row[] {
	if (speciesIds === undefined) {
		return mergedRows;
	}
	const touchedSpeciesIds = new Set(speciesIds);
	return mergedRows.filter(
		(row) => row.species_id !== null && touchedSpeciesIds.has(row.species_id)
	);
}

function cellKey(speciesId: number | null, timePeriod: string | null): string {
	return `${speciesId ?? 'null'}::${timePeriod ?? 'null'}`;
}

function indexByCell<
	Row extends { species_id: number | null; time_period: string | null }
>(rows: Row[]): Map<string, Row> {
	const index = new Map<string, Row>();
	for (const row of rows) {
		index.set(cellKey(row.species_id, row.time_period), row);
	}
	return index;
}

/** The one `FailedStatsCacheRefreshes.reason` value this module writes. */
const MISSING_FROM_METRIC_RPC = 'missing_from_metric_rpc';

/** Logs and returns a dead-letter row for a cell missing from some but not all metric RPC results — a real anomaly, not an expected gap. See this module's CLAUDE.md for why it's never zero/NULL-filled instead. */
function recordMissingCellAnomaly({
	groupId,
	cacheTable,
	temporalUnit,
	cellKey: key,
	missingFromRpc
}: {
	groupId: number;
	cacheTable: FailedRefreshCacheTable;
	temporalUnit: StatsTemporalUnit;
	cellKey: string;
	missingFromRpc: string[];
}): FailedRefreshRow {
	const [rawSpeciesId, rawTimePeriod] = key.split('::');
	const speciesId = rawSpeciesId === 'null' ? null : Number(rawSpeciesId);
	const timePeriod = rawTimePeriod === 'null' ? null : rawTimePeriod;
	console.error(
		'A cell is missing from one or more stats_cache_*_metrics RPC results; skipping it this refresh pass and leaving whatever is already cached for it untouched',
		{
			groupId,
			cacheTable,
			temporalUnit,
			speciesId,
			timePeriod,
			missingFromRpc
		}
	);
	return {
		group_id: groupId,
		cache_table: cacheTable,
		temporal_unit: temporalUnit,
		species_id: speciesId,
		time_period: timePeriod,
		reason: MISSING_FROM_METRIC_RPC,
		details: { missingFromRpc }
	};
}

type MergeMetricRowsParams = {
	groupId: number;
	temporalUnit: StatsTemporalUnit;
	groupBySpecies: boolean;
	basicRows: BasicSessionMetricsRow[];
	biometricsRows: BiometricsMetricsRow[];
	birdAgeRows: BirdAgeMetricsRow[];
	encounterAgeRows: EncounterAgeMetricsRow[];
};

/** Merges the four metric RPCs' per-cell rows, keyed by `(species_id, time_period)`, into the cache's full column set — one anomalous cell is skipped and dead-lettered, the rest of the batch is unaffected. */
export function mergeSimpleMetricRows({
	groupId,
	temporalUnit,
	groupBySpecies,
	basicRows,
	biometricsRows,
	birdAgeRows,
	encounterAgeRows
}: MergeMetricRowsParams): {
	mergedRows: SimpleMergedCell[];
	anomalies: FailedRefreshRow[];
} {
	const cacheTable: FailedRefreshCacheTable = groupBySpecies
		? 'SimpleStatsCacheBySpecies'
		: 'SimpleStatsCache';
	const basicByCell = indexByCell(basicRows);
	const biometricsByCell = indexByCell(biometricsRows);
	const birdAgeByCell = indexByCell(birdAgeRows);
	const encounterAgeByCell = indexByCell(encounterAgeRows);

	const allCellKeys = new Set<string>([
		...basicByCell.keys(),
		...biometricsByCell.keys(),
		...birdAgeByCell.keys(),
		...encounterAgeByCell.keys()
	]);

	const mergedRows: SimpleMergedCell[] = [];
	const anomalies: FailedRefreshRow[] = [];

	for (const key of allCellKeys) {
		const basic = basicByCell.get(key);
		const biometrics = biometricsByCell.get(key);
		const birdAge = birdAgeByCell.get(key);
		const encounterAge = encounterAgeByCell.get(key);

		if (!basic || !biometrics || !birdAge || !encounterAge) {
			const missingFromRpc: string[] = [];
			if (!basic) missingFromRpc.push('stats_cache_basic_session_metrics');
			if (!biometrics) missingFromRpc.push('stats_cache_biometrics_metrics');
			if (!birdAge) missingFromRpc.push('stats_cache_bird_age_metrics');
			if (!encounterAge) {
				missingFromRpc.push('stats_cache_encounter_age_metrics');
			}
			anomalies.push(
				recordMissingCellAnomaly({
					groupId,
					cacheTable,
					temporalUnit,
					cellKey: key,
					missingFromRpc
				})
			);
			continue;
		}

		mergedRows.push({
			species_id: basic.species_id,
			time_period: basic.time_period,
			// Non-null assertions trust each RPC's own SQL-level COALESCE guarantee.
			species_count: basic.species_count!,
			bird_count: basic.bird_count!,
			encounter_count: basic.encounter_count!,
			new_bird_count: basic.new_bird_count!,
			session_count: basic.session_count!,
			total_effort: basic.total_effort!,
			effort_per_session: basic.effort_per_session!,
			effort_per_encounter: basic.effort_per_encounter!,
			avg_encounters_per_session: basic.avg_encounters_per_session!,
			max_per_session: basic.max_per_session!,
			max_new_per_session: basic.max_new_per_session!,
			// Biometric columns are deliberately left nullable — an empty cell
			// has no value at all, matching biometrics_stats' own behaviour.
			max_weight: biometrics.max_weight,
			avg_weight: biometrics.avg_weight,
			min_weight: biometrics.min_weight,
			median_weight: biometrics.median_weight,
			max_wing: biometrics.max_wing,
			avg_wing: biometrics.avg_wing,
			min_wing: biometrics.min_wing,
			median_wing: biometrics.median_wing,
			pullus_bird_count: birdAge.pullus_bird_count!,
			juv_bird_count: birdAge.juv_bird_count!,
			postjuv_bird_count: birdAge.postjuv_bird_count!,
			adult_bird_count: birdAge.adult_bird_count!,
			unknown_age_bird_count: birdAge.unknown_age_bird_count!,
			new_young_bird_count: birdAge.new_young_bird_count!,
			pullus_enc_count: encounterAge.pullus_enc_count!,
			juv_enc_count: encounterAge.juv_enc_count!,
			postjuv_enc_count: encounterAge.postjuv_enc_count!,
			adult_enc_count: encounterAge.adult_enc_count!,
			unknown_age_enc_count: encounterAge.unknown_age_enc_count!,
			postjuv_juv_enc_count: encounterAge.postjuv_juv_enc_count!,
			new_postjuv_juv_enc_count: encounterAge.new_postjuv_juv_enc_count!,
			new_postjuv_enc_count: encounterAge.new_postjuv_enc_count!
		});
	}

	return { mergedRows, anomalies };
}
