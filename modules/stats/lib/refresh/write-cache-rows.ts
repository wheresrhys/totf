import type { SupabaseClient } from '@supabase/supabase-js';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { TemporalUnit, MergedCellKey, FailedRefreshRow } from '../../types';
import { runStatsCacheDbCall } from './db-call-logging';

/** The `time_period` the cache tables use for the all-time grain (NOT NULL column; metric RPCs emit a real NULL instead) — see this module's CLAUDE.md. */
const ALL_TIME_SENTINEL_DATE = '0001-01-01';

/** `SimpleStatsCacheBySpecies`' sole unique constraint — keep in sync **by hand** with its schema file. */
const BY_SPECIES_CONFLICT_TARGET =
	'group_id,temporal_unit,time_period,species_id';

/** `SimpleStatsCache`'s sole unique constraint (no `species_id` column) — keep in sync **by hand** with its schema file. */
const ALL_SPECIES_CONFLICT_TARGET = 'group_id,temporal_unit,time_period';

/** Row-count cap per cache-table `.upsert()` call, since `day` writes can scale unbounded with touched dates. */
export const DEFAULT_STATS_CACHE_WRITE_CHUNK_SIZE = 100;

/** Splits `items` into fixed-size chunks, last one short if it doesn't divide evenly. */
function chunkArray<T>(items: T[], chunkSize: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += chunkSize) {
		chunks.push(items.slice(i, i + chunkSize));
	}
	return chunks;
}

/** Writes a species-grouped pass's merged cells to `*BySpecies`, chunked `.upsert()`s issued sequentially. Resolves the NULL→sentinel `time_period` conversion — see this module's CLAUDE.md. */
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

/** Sibling of `writeBySpeciesRows` for the non-species-grouped pass — writes `SimpleStatsCache`, which has no `species_id` column at all. */
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

/** Dead-letters the cells a merge pass had to skip, in one plain insert (no conflict target — the table has no uniqueness), called after the cache write so a dead-letter failure never costs the refresh itself. */
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
