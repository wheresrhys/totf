import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase.types';
// Relative, not `@/`-aliased, for the same reason `lib/demon-import.ts` and
// `lib/queue-dispatch.ts` import their own sibling modules relatively: these
// are value imports `lib/` needs at runtime (the CLI importer's `tsx` runner
// included), and `@/` alias resolution is scoped to tsconfig.json's
// `include`, which `lib/` sits outside of. The `@/`-aliased import above is
// `import type` only, erased before either runtime sees it, so it isn't
// subject to the same constraint.
import { catchSupabaseErrors } from './supabase';

/**
 * Populates `SimpleStatsCache` (#1144, retrofitted by #1162) — the
 * period-local half of the stats-cache split (see that table's own schema
 * file for the other half, `ComplexStatsCache`). This is the write side for
 * the four read-only "metric-group" RPCs #1145/#1146/#1148/#1149/#1150/#1151
 * created (`stats_cache_basic_session_metrics`, `stats_cache_biometrics_metrics`,
 * `stats_cache_bird_age_metrics`, `stats_cache_encounter_age_metrics`), merged
 * in TS and written through the dedicated `upsert_simple_stats_cache_rows` RPC
 * rather than a native `supabase-js` `.upsert()` — PostgREST's upsert can only
 * target a plain unique constraint by column list, and this table's four
 * null-patterns need four partial indexes (see `upsert_simple_stats_cache_rows`'s
 * own file for why). The queue consumer that calls this per dispatched
 * temporal-unit event is a later ticket (T10) — this module only refreshes
 * one temporal unit per call, it does not loop over temporal units itself.
 */

/**
 * Matches `SimpleStatsCache.temporal_unit`'s CHECK constraint — same name and
 * value set as `supabase/__tests__/stats-cache-fixtures.ts`'s own
 * `TemporalUnit` (duplicated rather than imported: `lib/` doesn't reach into
 * `supabase/__tests__/`, a different zone's test-only fixtures).
 */
export type TemporalUnit =
	| 'day'
	| 'month'
	| 'year'
	| 'month-squashed'
	| 'all-time';

export type RefreshSimpleStatsCacheParams = {
	groupId: number;
	temporalUnit: TemporalUnit;
	/**
	 * The exact `time_period` values this refresh pass should write, in the
	 * same string shape the metric RPCs return for that temporal unit.
	 * Required (non-empty) for the narrow temporal units (`day`/`month`/
	 * `year`) — see `buildMetricRpcParams`'s early-return for what happens if
	 * it's empty there. Ignored entirely for `month-squashed`/`all-time`,
	 * which always full-replace the whole group history regardless of what's
	 * passed.
	 */
	periods?: string[];
};

type BasicSessionMetricsRow =
	Database['public']['CompositeTypes']['stats_cache_basic_session_metrics_result'];
type BiometricsMetricsRow =
	Database['public']['CompositeTypes']['stats_cache_biometrics_metrics_result'];
type BirdAgeMetricsRow =
	Database['public']['CompositeTypes']['stats_cache_bird_age_metrics_result'];
type EncounterAgeMetricsRow =
	Database['public']['CompositeTypes']['stats_cache_encounter_age_metrics_result'];

/**
 * The jsonb row shape `upsert_simple_stats_cache_rows` expects in `p_rows` —
 * `SimpleStatsCache`'s own Insert shape minus the columns the RPC takes as
 * separate scalar parameters (`group_id`, `temporal_unit`) or derives itself
 * (`id`).
 */
type MergedCell = Omit<
	Database['public']['Tables']['SimpleStatsCache']['Insert'],
	'id' | 'group_id' | 'temporal_unit'
>;

/**
 * One dead-letter row for `FailedStatsCacheRefreshes` (#1167) — a cell this
 * refresh pass could not write. `id`/`created_at` are database-defaulted.
 */
type FailedRefreshRow = Omit<
	Database['public']['Tables']['FailedStatsCacheRefreshes']['Insert'],
	'id' | 'created_at'
>;

/**
 * The one `FailedStatsCacheRefreshes.reason` value this module writes: the cell
 * was present in some but not all of the `stats_cache_*_metrics` RPC results.
 * The column is deliberately unconstrained text so a new failure kind needs no
 * migration — see that table's own column comment.
 */
const MISSING_FROM_METRIC_RPC = 'missing_from_metric_rpc';

const NARROW_TEMPORAL_UNITS: ReadonlySet<TemporalUnit> = new Set([
	'day',
	'month',
	'year'
]);

function isNarrowTemporalUnit(
	temporalUnit: TemporalUnit
): temporalUnit is 'day' | 'month' | 'year' {
	return NARROW_TEMPORAL_UNITS.has(temporalUnit);
}

/**
 * The shared 8-arg filter shape every `stats_cache_*_metrics` RPC takes
 * (mirrors `core_stats`'/`biometrics_stats`' own input signature — see
 * `app/lib/auth/group-summary-access.ts`'s `CoreStatsRpcParams` and
 * `app/lib/supabase/temporal-filter.ts`) — only the subset this function
 * ever needs to set.
 */
type MetricRpcParams = {
	ringing_group_filter: number;
	group_by_species: true;
	group_by_time_period?: 'day' | 'month' | 'year' | 'month-squashed';
	from_date?: string;
	to_date?: string;
};

/**
 * Builds the shared filter object passed to all four metric RPCs for one
 * temporal-unit invocation. Returns `null` for a narrow temporal unit with no
 * touched periods — there is no sensible `from_date`/`to_date` window to
 * compute in that case, and nothing would be narrowed by it anyway, so
 * `refreshSimpleStatsCache` treats that as "nothing to refresh" rather than
 * falling back to an unbounded, effectively all-time call under narrow
 * semantics.
 */
function buildMetricRpcParams(
	groupId: number,
	temporalUnit: TemporalUnit,
	periods: string[]
): MetricRpcParams | null {
	if (isNarrowTemporalUnit(temporalUnit)) {
		if (periods.length === 0) {
			return null;
		}
		// `yyyy-MM-dd`-shaped period strings sort lexicographically in date
		// order (same convention as `app/lib/supabase/temporal-filter.ts`'s
		// `laterDateBound`/`earlierDateBound`), so min/max is a plain sort.
		const sortedPeriods = [...periods].sort();
		return {
			ringing_group_filter: groupId,
			group_by_species: true,
			group_by_time_period: temporalUnit,
			from_date: sortedPeriods[0],
			to_date: sortedPeriods[sortedPeriods.length - 1]
		};
	}

	// month-squashed/all-time: always full-replace, over the group's whole
	// history (no from_date/to_date), and the `periods` argument is ignored
	// entirely. For all-time, `group_by_time_period` is omitted completely
	// rather than set to any value — the same "omit the key for all-time"
	// convention `app/actions/summary-stats.ts`'s `fetchSummaryStats` and
	// `lib/stats-cache-refresh-events.ts`'s all-time event use.
	return {
		ringing_group_filter: groupId,
		group_by_species: true,
		...(temporalUnit === 'month-squashed'
			? { group_by_time_period: 'month-squashed' as const }
			: {})
	};
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

type MergeMetricRowsParams = {
	groupId: number;
	temporalUnit: TemporalUnit;
	basicRows: BasicSessionMetricsRow[];
	biometricsRows: BiometricsMetricsRow[];
	birdAgeRows: BirdAgeMetricsRow[];
	encounterAgeRows: EncounterAgeMetricsRow[];
};

/**
 * Merges the four metric RPCs' per-cell rows, keyed by `(species_id,
 * time_period)`, into `SimpleStatsCache`'s full column set. All four share
 * the same `stats_spine` call, so every cell key should appear in every RPC's
 * result — a cell key present in some but not all four is an anomaly
 * (discussed and settled on PR #1164's review): it is logged (group id,
 * temporal unit, species_id, time_period, which RPC was missing it) and that
 * one cell is skipped entirely, leaving whatever's already cached for it
 * untouched. Every OTHER cell in the batch is unaffected — one anomalous
 * cell never drops the rest of the refresh.
 *
 * Anomalies are *collected* and returned alongside the merged rows rather than
 * written here (#1167): this stays a synchronous pure function with no Supabase
 * client of its own, and `refreshSimpleStatsCache` — which already holds the
 * client — writes the whole batch to `FailedStatsCacheRefreshes` in one insert
 * once merging has finished.
 *
 * Never zero-fill, NULL-fill, or otherwise invent a value for a column this
 * refresh pass has no real data for: `upsert_simple_stats_cache_rows`
 * requires a fully-populated row by design specifically so no half-written/
 * placeholder row can ever land in `SimpleStatsCache`, and replicating that
 * gap here in TS would defeat the point.
 */
function mergeMetricRows({
	groupId,
	temporalUnit,
	basicRows,
	biometricsRows,
	birdAgeRows,
	encounterAgeRows
}: MergeMetricRowsParams): {
	mergedRows: MergedCell[];
	anomalies: FailedRefreshRow[];
} {
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

	const mergedRows: MergedCell[] = [];
	const anomalies: FailedRefreshRow[] = [];

	for (const key of allCellKeys) {
		const basic = basicByCell.get(key);
		const biometrics = biometricsByCell.get(key);
		const birdAge = birdAgeByCell.get(key);
		const encounterAge = encounterAgeByCell.get(key);

		const missingFromRpc: string[] = [];
		if (!basic) missingFromRpc.push('stats_cache_basic_session_metrics');
		if (!biometrics) missingFromRpc.push('stats_cache_biometrics_metrics');
		if (!birdAge) missingFromRpc.push('stats_cache_bird_age_metrics');
		if (!encounterAge) {
			missingFromRpc.push('stats_cache_encounter_age_metrics');
		}

		if (!basic || !biometrics || !birdAge || !encounterAge) {
			const [rawSpeciesId, rawTimePeriod] = key.split('::');
			const speciesId = rawSpeciesId === 'null' ? null : Number(rawSpeciesId);
			const timePeriod = rawTimePeriod === 'null' ? null : rawTimePeriod;
			// The log line stays for immediate visibility; the returned anomaly is
			// the durable record (#1167).
			console.error(
				'A cell is missing from one or more stats_cache_*_metrics RPC results; skipping it this refresh pass and leaving whatever is already cached for it untouched',
				{
					groupId,
					temporalUnit,
					speciesId,
					timePeriod,
					missingFromRpc
				}
			);
			anomalies.push({
				group_id: groupId,
				cache_table: 'SimpleStatsCache',
				temporal_unit: temporalUnit,
				species_id: speciesId,
				time_period: timePeriod,
				reason: MISSING_FROM_METRIC_RPC,
				details: { missingFromRpc }
			});
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

/**
 * Refreshes `SimpleStatsCache` for one `(groupId, temporalUnit)` combination.
 * One temporal unit per call — a future queue consumer (T10) calls this once
 * per temporal-unit event it receives; this function does not loop over
 * temporal units itself.
 *
 * `day`/`month`/`year` narrow by `periods`: the metric RPCs are called over
 * a `from_date`/`to_date` window spanning `min(periods)`..`max(periods)`,
 * and the merged result is filtered down to just the periods actually
 * touched before writing — the window call can return extra untouched
 * periods inside that range.
 *
 * `month-squashed`/`all-time` always full-replace the group's whole history,
 * ignoring `periods` entirely.
 *
 * Writes go through exactly one `upsert_simple_stats_cache_rows` call — never
 * a native `.upsert()` (see that RPC's own file for why) and never more than
 * one call per metric RPC's worth of rows.
 *
 * Any cell `mergeMetricRows` had to skip is then dead-lettered to
 * `FailedStatsCacheRefreshes` in one batched `.insert()` (#1167) — a plain
 * PostgREST insert, not an RPC: that table has no uniqueness to arbitrate, so
 * nothing needs the custom-upsert treatment the two cache tables need.
 *
 * Known-accepted limitation: a species whose *entire* history disappears
 * falls out of `stats_spine`'s species-set entirely, so it never gets a
 * fresh row written to overwrite a stale one — an upsert can only ever
 * refresh cells the spine still produces. Out of scope for this ticket.
 */
export async function refreshSimpleStatsCache(
	supabaseClient: SupabaseClient,
	{ groupId, temporalUnit, periods }: RefreshSimpleStatsCacheParams
): Promise<void> {
	const touchedPeriods = periods ?? [];

	const rpcParams = buildMetricRpcParams(groupId, temporalUnit, touchedPeriods);
	if (rpcParams === null) {
		// Narrow temporal unit, nothing touched this pass — nothing to refresh.
		return;
	}

	const [basicRows, biometricsRows, birdAgeRows, encounterAgeRows] =
		await Promise.all([
			supabaseClient
				.rpc('stats_cache_basic_session_metrics', rpcParams)
				.then(catchSupabaseErrors),
			supabaseClient
				.rpc('stats_cache_biometrics_metrics', rpcParams)
				.then(catchSupabaseErrors),
			supabaseClient
				.rpc('stats_cache_bird_age_metrics', rpcParams)
				.then(catchSupabaseErrors),
			supabaseClient
				.rpc('stats_cache_encounter_age_metrics', rpcParams)
				.then(catchSupabaseErrors)
		]);

	const { mergedRows, anomalies } = mergeMetricRows({
		groupId,
		temporalUnit,
		basicRows: (basicRows ?? []) as BasicSessionMetricsRow[],
		biometricsRows: (biometricsRows ?? []) as BiometricsMetricsRow[],
		birdAgeRows: (birdAgeRows ?? []) as BirdAgeMetricsRow[],
		encounterAgeRows: (encounterAgeRows ?? []) as EncounterAgeMetricsRow[]
	});

	const rowsToWrite = isNarrowTemporalUnit(temporalUnit)
		? mergedRows.filter(
				(row) =>
					row.time_period !== null && touchedPeriods.includes(row.time_period)
			)
		: mergedRows;

	await supabaseClient
		.rpc('upsert_simple_stats_cache_rows', {
			p_group_id: groupId,
			p_temporal_unit: temporalUnit,
			p_group_by_species: true,
			p_rows: rowsToWrite
		})
		.then(catchSupabaseErrors);

	// Dead-letter the anomalous cells after the cache write, in one multi-row
	// insert — a failure recording the anomaly must never cost us the rest of
	// the refresh, which has already landed by this point. Deliberately NOT
	// narrowed to `touchedPeriods` the way `rowsToWrite` is: a cell missing from
	// one metric RPC is a real data anomaly whichever period it sits in, and
	// keeping the table's contents identical to what was logged above is one
	// fewer discrepancy to reason about when reading it back.
	if (anomalies.length > 0) {
		await supabaseClient
			.from('FailedStatsCacheRefreshes')
			.insert(anomalies)
			.then(catchSupabaseErrors);
	}
}
