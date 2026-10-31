import type {
	TemporalUnit,
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

/**
 * Cuts a merged result back to exactly the periods this pass is refreshing, for
 * a narrowing temporal unit. Load-bearing for the window-narrowed unit, `day`:
 * the `min(periods)`..`max(periods)` window `buildMetricRpcParams` computes
 * spans untouched gaps inside that range, so the RPCs can legitimately return
 * cells for periods that weren't touched — those must not be rewritten. A
 * pass-through for `refreshSimpleStatsCache`'s exact-filtered
 * `month`/`year`/`month-squashed` fan-out, whose calls cannot return an
 * untouched period in the first place (#1176/#1178). A non-narrowing temporal
 * unit full-replaces, so every merged row is kept.
 */
export function filterToTouchedPeriods<Row extends MergedCellKey>(
	mergedRows: Row[],
	temporalUnit: TemporalUnit,
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

/**
 * Cuts a species-grouped merged result back to exactly the species
 * `speciesIds` names, when given. `undefined` is "no narrowing" — every row
 * is kept, matching every call site before this field existed. Only ever
 * called from the `groupBySpecies: true` branch of a refresh pass: the
 * all-species-combined write has no `species_id` to filter on, and must
 * always see the full, unfiltered result regardless of `speciesIds` — see
 * `RefreshSpeciesNarrowing`'s own doc comment for why.
 */
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

/**
 * The one `FailedStatsCacheRefreshes.reason` value this module writes: the cell
 * was present in some but not all of the `stats_cache_*_metrics` RPC results.
 * The column is deliberately unconstrained text so a new failure kind needs no
 * migration — see that table's own column comment.
 */
const MISSING_FROM_METRIC_RPC = 'missing_from_metric_rpc';

/**
 * Records a cell that appeared in some but not all of a refresh's metric RPC
 * results. Every RPC of a given cache shares the same `stats_spine` call, so a
 * cell key present in one but absent from another is an anomaly, not an
 * expected gap (discussed and settled on PR #1164's review) — the cell is
 * logged with enough context to act on and then skipped entirely, leaving
 * whatever is already cached for it untouched.
 *
 * The `console.error` stays for immediate visibility; the returned row is the
 * durable record, dead-lettered to `FailedStatsCacheRefreshes` (#1167). It is
 * *returned* rather than written here so both merge functions stay synchronous
 * and pure, with no Supabase client of their own — each refresh function, which
 * already holds the client, writes its whole batch in one insert once merging
 * has finished.
 *
 * Never zero-fill, NULL-fill, or otherwise invent a value for a column a
 * refresh pass has no real data for: every cache-table metric column bar the
 * eight biometric ones is NOT NULL by design, specifically so no half-written/
 * placeholder row can ever land in either cache table, and faking a value here
 * in TS would defeat the point.
 */
function recordMissingCellAnomaly({
	groupId,
	cacheTable,
	temporalUnit,
	cellKey: key,
	missingFromRpc
}: {
	groupId: number;
	cacheTable: FailedRefreshCacheTable;
	temporalUnit: TemporalUnit;
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
	temporalUnit: TemporalUnit;
	groupBySpecies: boolean;
	basicRows: BasicSessionMetricsRow[];
	biometricsRows: BiometricsMetricsRow[];
	birdAgeRows: BirdAgeMetricsRow[];
	encounterAgeRows: EncounterAgeMetricsRow[];
};

/**
 * Merges the four `SimpleStatsCache` metric RPCs' per-cell rows, keyed by
 * `(species_id, time_period)`, into that table's full column set. All four
 * share the same `stats_spine` call, so every cell key should appear in every
 * RPC's result — a cell key present in some but not all four is skipped,
 * logged, and returned as an anomaly for the caller to dead-letter (see
 * `recordMissingCellAnomaly`), tagged `SimpleStatsCacheBySpecies` when
 * `groupBySpecies` or plain `SimpleStatsCache` otherwise (#1182) — the same
 * table `groupBySpecies` decides this pass writes its merged rows to. Every
 * OTHER cell in the batch is unaffected — one anomalous cell never drops the
 * rest of the refresh.
 */
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
			// The metric RPCs' composite return types mark every column
			// nullable (Postgres composite types carry no NOT NULL metadata),
			// but each of these specific columns is COALESCEd to a real value
			// in SQL — see each RPC's own schema file. The assertions below
			// trust that SQL-level guarantee rather than re-deriving it here.
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
