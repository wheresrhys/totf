'use server';
import { fetchAllPaginatedRows } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedSupabaseClient } from '../../../app/lib/auth/group-auth';
import type { TemporalUnit } from '../types';
import type { ViewedGroup } from '@/app/lib/group-slug';

// A row as PostgREST returns it for `readStatsCacheRows`'s generic
// `select('*')` read: every column of whichever table was chosen, plus the
// embedded Species row when a Species embed was requested (an inner-join
// species filter, or a plain by-species resolve-only embed). The row itself
// isn't typed to a known result shape — that narrowing is each caller's own
// job.
type GenericStatsCacheRow = Record<string, unknown> & {
	Species?: { species_name: string } | null;
};

export type StatsCacheReadParams = {
	viewedGroup: ViewedGroup;
	bySpecies: boolean;
	species?: string;
	temporalUnit: TemporalUnit;
	timePeriod?: string;
	fromDate?: string;
	toDate?: string;
	client?: SupabaseClient;
};

/**
 * Generic `SimpleStatsCache`/`SimpleStatsCacheBySpecies` row reader (#1233) —
 * the shared mechanism meant to replace every hand-rolled reader this repo
 * used to carry. All three follow-up tickets that migrated onto it have now
 * landed: `fetchSpeciesStatsCacheRows` in `app/actions/sp-data.ts` (#1235)
 * and `runStatsCacheRead` in `app/lib/auth/group-summary-access.ts` (#1234)
 * are each a thin adapter over this function, and #1236 moved every
 * remaining `stats-cache.ts` consumer (the home page's summary stats, the
 * Highlights pooled fetch via `readStatsCacheRows` below, and
 * `SpDemographicsTab`'s effort history) onto it directly too, then deleted
 * this file's now-dead old column-subset machinery
 * (`getStatsCacheTableFetcher`/`getServerCachedStats`/`fetchCoreStatsByMonth`).
 *
 * Unlike a hand-picked column-subset reader, this one always `select('*')`s
 * — that's the entire point of generalising: a caller narrows the returned
 * `Record<string, unknown>[]` to whatever result type it needs (e.g.
 * `CoreStatsResult`) itself, once it migrates onto this function, rather than
 * this function hard-coding one caller's column list.
 *
 * - **Table**: `SimpleStatsCacheBySpecies` when `bySpecies`, else
 *   `SimpleStatsCache`.
 * - **Species embed/filter**: a `species` filter always goes through an
 *   `!inner` embed (`fetchSpeciesStatsCacheRows`'s idiom) — the common case is
 *   a `bySpecies` read, since the all-species-combined table carries no
 *   species relationship to join on at all. With no `species` filter, a
 *   `bySpecies` read still embeds `Species(species_name)` (non-inner) purely
 *   to resolve the name onto every row; an all-species read has no embed at
 *   all.
 * - **Group/temporal-unit filter**: always `group_id` + `temporal_unit`.
 * - **Time filter**: exactly one of an exact `timePeriod` match, or a
 *   `fromDate`/`toDate` range.
 * - **Pagination**: via `fetchAllPaginatedRows`.
 * - **Ordering**: `time_period`, then — for a `bySpecies` read — the embedded
 *   `Species(species_name)`, via PostgREST's `order=Species(species_name)`
 *   spelling (not supabase-js' `{referencedTable}` option, which orders rows
 *   *within* the embed rather than the parent rows).
 * - **`species_name` resolution**: flattened from the embed onto every row of
 *   a `bySpecies` read (filtered or not); `null` on an all-species read.
 * - **No caching**: a plain pass-through read against an already-materialized
 *   cache table.
 */
export async function readStatsCacheRows({
	client,
	viewedGroup,
	bySpecies,
	species,
	temporalUnit,
	timePeriod,
	fromDate,
	toDate
}: StatsCacheReadParams): Promise<Record<string, unknown>[]> {
	client = client ?? (await getAuthenticatedSupabaseClient());
	const tableName = bySpecies
		? 'SimpleStatsCacheBySpecies'
		: 'SimpleStatsCache';
	const selectedColumns = species
		? '*, Species!inner(species_name)'
		: bySpecies
			? '*, Species(species_name)'
			: '*';

	const rows = await fetchAllPaginatedRows<GenericStatsCacheRow>(
		(fromRow, toRow) => {
			let filtered = client
				.from(tableName)
				// The select string is assembled at runtime, so supabase-js
				// can't infer the row shape from a string literal — name it
				// explicitly.
				.select<string, GenericStatsCacheRow>(selectedColumns)
				.eq('group_id', viewedGroup.id)
				.eq('temporal_unit', temporalUnit);
			if (species) {
				filtered = filtered.eq('Species.species_name', species);
			}
			if (timePeriod) {
				filtered = filtered.eq('time_period', timePeriod);
			} else {
				if (fromDate) {
					filtered = filtered.gte('time_period', fromDate);
				}
				if (toDate) {
					filtered = filtered.lte('time_period', toDate);
				}
			}
			const ordered = bySpecies
				? filtered.order('time_period').order('Species(species_name)')
				: filtered.order('time_period');
			return ordered.range(fromRow, toRow);
		}
	);

	return rows.map(({ Species, ...row }) => ({
		...row,
		species_name: bySpecies ? (Species?.species_name ?? null) : null
	}));
}
