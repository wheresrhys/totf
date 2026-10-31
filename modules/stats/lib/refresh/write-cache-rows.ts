import type { SupabaseClient } from '@supabase/supabase-js';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { TemporalUnit, MergedCellKey, FailedRefreshRow } from '../../types';
import { runStatsCacheDbCall } from './db-call-logging';

/**
 * The `time_period` value the cache tables use for the all-time grain. Those
 * columns are NOT NULL so that a single plain UNIQUE constraint arbitrates
 * every grain and a native `.upsert()` can name it as a conflict target
 * (#1169), but the metric RPCs emit a real NULL for all-time — the two
 * conventions meet below. A genuinely out-of-domain date, not a merely
 * unlikely one: no ringing data comes anywhere near it.
 */
const ALL_TIME_SENTINEL_DATE = '0001-01-01';

/**
 * `SimpleStatsCacheBySpecies`' sole unique constraint, as the bare column list
 * PostgREST's `onConflict` takes. Keep in sync **by hand** with
 * `simple_stats_cache_by_species_group_grain_period_species_key` — see that
 * table's own schema file.
 */
const BY_SPECIES_CONFLICT_TARGET =
	'group_id,temporal_unit,time_period,species_id';

/**
 * `SimpleStatsCache`'s sole unique constraint —
 * `simple_stats_cache_group_grain_period_key`, see that table's own schema
 * file. One fewer column than `BY_SPECIES_CONFLICT_TARGET`: this table has
 * no `species_id` column at all.
 */
const ALL_SPECIES_CONFLICT_TARGET = 'group_id,temporal_unit,time_period';

/**
 * Row-count cap for each cache-table `.upsert()` call below — same value as
 * `lib/demon-import.ts`'s `DEFAULT_DEMON_RECORDS_BATCH_SIZE` /
 * `DEFAULT_ENCOUNTER_ROW_CHUNK_SIZE`, kept as its own constant here rather
 * than imported since this is a separate write path. `month`/`year`/
 * `month-squashed`/`all-time` passes never produce more than a few dozen
 * rows, but `day` scales with however many distinct dates an import touched
 * (times species count for the by-species table), which is otherwise
 * unbounded.
 */
export const DEFAULT_STATS_CACHE_WRITE_CHUNK_SIZE = 100;

/** Splits `items` into fixed-size chunks, last one short if it doesn't divide evenly. */
function chunkArray<T>(items: T[], chunkSize: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += chunkSize) {
		chunks.push(items.slice(i, i + chunkSize));
	}
	return chunks;
}

/**
 * Writes one species-grouped refresh pass's merged cells to its cache's
 * `*BySpecies` table, via native `.upsert()` calls against that table's one
 * unique constraint — chunked to at most `DEFAULT_STATS_CACHE_WRITE_CHUNK_SIZE`
 * rows per call, issued sequentially (not `Promise.all`) since every chunk
 * targets the same unique index, matching `demon-import.ts`'s
 * `DemonRecordsBatchWriter` chaining precedent.
 *
 * This is where the two `time_period` conventions are reconciled: the metric
 * RPCs emit a real NULL for the all-time grain, the cache column is NOT NULL,
 * so a null becomes `ALL_TIME_SENTINEL_DATE` here rather than in the merge —
 * which has to keep the NULL to match cells across RPC results by key.
 *
 * `species_id` is asserted non-null because this is only ever called with
 * cells from a `group_by_species: true` pass, so every cell carries a real
 * species id — see `writeAllSpeciesRows` for the sibling non-species pass's
 * writer.
 *
 * Each chunk's `.upsert()` call is logged individually (`runStatsCacheDbCall`,
 * table name + that chunk's own row count) rather than once for the whole
 * write — a `day`-grain pass can split into several chunks, and the pass's
 * total row count would misreport how many rows any one failing call
 * actually sent.
 */
export async function writeBySpeciesRows<Cell extends MergedCellKey>(
	supabaseClient: SupabaseClient,
	cacheTable: 'SimpleStatsCacheBySpecies',
	cells: Cell[],
	context: { groupId: number; temporalUnit: TemporalUnit } & Record<
		string,
		unknown
	>
): Promise<void> {
	const { groupId, temporalUnit } = context;
	const rows = cells.map(({ species_id, time_period, ...metrics }) => ({
		...metrics,
		group_id: groupId,
		temporal_unit: temporalUnit,
		species_id: species_id!,
		time_period: time_period ?? ALL_TIME_SENTINEL_DATE
	}));
	for (const chunk of chunkArray(rows, DEFAULT_STATS_CACHE_WRITE_CHUNK_SIZE)) {
		await runStatsCacheDbCall(
			{ kind: 'upsert', table: cacheTable, rowCount: chunk.length },
			context,
			async () =>
				supabaseClient
					.from(cacheTable)
					.upsert(chunk, { onConflict: BY_SPECIES_CONFLICT_TARGET })
					.then(catchSupabaseErrors)
		);
	}
}

/**
 * Writes one non-species-grouped refresh pass's merged cells to the
 * all-species-combined `SimpleStatsCache` table, the sibling of
 * `writeBySpeciesRows` for a `group_by_species: false` pass. Chunked the same
 * way — see `writeBySpeciesRows`'s docblock for why.
 *
 * This table has no `species_id` column at all (#1169 — a nullable
 * `species_id` meaning "all species" was tried and reverted), so `species_id`
 * is destructured off each cell and dropped rather than written; every cell
 * reaching here carries `species_id: null` anyway, since the RPCs collapse
 * every species into one row per `time_period` under `group_by_species:
 * false`. Same `ALL_TIME_SENTINEL_DATE` reconciliation as `writeBySpeciesRows`,
 * against the narrower `(group_id, temporal_unit, time_period)` conflict
 * target this table shape's unique constraint uses.
 *
 * Each chunk's `.upsert()` call is logged individually — see
 * `writeBySpeciesRows`'s docblock for why.
 */
export async function writeAllSpeciesRows<Cell extends MergedCellKey>(
	supabaseClient: SupabaseClient,
	cacheTable: 'SimpleStatsCache',
	cells: Cell[],
	context: { groupId: number; temporalUnit: TemporalUnit } & Record<
		string,
		unknown
	>
): Promise<void> {
	const { groupId, temporalUnit } = context;
	const rows = cells.map(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to exclude it from ...metrics; this table has no species_id column
		({ species_id, time_period, ...metrics }) => ({
			...metrics,
			group_id: groupId,
			temporal_unit: temporalUnit,
			time_period: time_period ?? ALL_TIME_SENTINEL_DATE
		})
	);
	for (const chunk of chunkArray(rows, DEFAULT_STATS_CACHE_WRITE_CHUNK_SIZE)) {
		await runStatsCacheDbCall(
			{ kind: 'upsert', table: cacheTable, rowCount: chunk.length },
			context,
			async () =>
				supabaseClient
					.from(cacheTable)
					.upsert(chunk, { onConflict: ALL_SPECIES_CONFLICT_TARGET })
					.then(catchSupabaseErrors)
		);
	}
}

/**
 * Dead-letters the cells a merge pass had to skip, in one multi-row insert —
 * a plain insert rather than the `.upsert()` above: `FailedStatsCacheRefreshes`
 * has no uniqueness to arbitrate, so there is no conflict target to name.
 *
 * Called *after* the cache write in both refresh functions: a failure recording
 * the anomaly must never cost us the rest of the refresh, which has already
 * landed by that point. Deliberately NOT narrowed to `touchedPeriods` the way
 * the written rows are — a cell missing from one metric RPC is a real data
 * anomaly whichever period it sits in, and keeping the table's contents
 * identical to what was logged is one fewer discrepancy to reason about when
 * reading it back.
 *
 * Logged via `runStatsCacheDbCall` (table + row count) only when there's
 * actually a call to make — the `anomalies.length === 0` early return isn't a
 * DB call, so there's nothing to log.
 */
export async function deadLetterAnomalies(
	supabaseClient: SupabaseClient,
	anomalies: FailedRefreshRow[],
	context: Record<string, unknown>
): Promise<void> {
	if (anomalies.length === 0) {
		return;
	}
	await runStatsCacheDbCall(
		{
			kind: 'insert',
			table: 'FailedStatsCacheRefreshes',
			rowCount: anomalies.length
		},
		context,
		async () =>
			supabaseClient
				.from('FailedStatsCacheRefreshes')
				.insert(anomalies)
				.then(catchSupabaseErrors)
	);
}
