'use server';
import {
	readStatsCacheRows,
	type StatsCacheBySpeciesResult
} from '@/modules/stats';
import type { ViewedGroup } from '@/app/lib/group-slug';

/**
 * Every by-species stats cell a group has, in one go (#115) — the
 * species-comparison page's only fetch.
 *
 * Reads `SimpleStatsCacheBySpecies` (#1206) rather than running the live
 * metric RPCs: the cache table's `all-time` rows are the precomputed
 * equivalent of the old group-wide, `group_by_species: true` RPC calls with no
 * time-period grouping. The read itself is delegated to `modules/stats`'
 * `readStatsCacheRows` (#1412), which owns the whole mechanism — the
 * `Species(species_name)` embed off the table's existing `species_id` FK, the
 * flattening of that name onto every row, the `group_id`/`temporal_unit`
 * filters, the ordering, and the `fetchAllPaginatedRows` loop this page's
 * hand-rolled read was missing (a group with more by-species rows than one
 * PostgREST page used to lose the overflow silently).
 *
 * One array of whole cache rows comes back, not a
 * `{ coreStats, biometricsStats }` pair: the page's two tabs are two *column
 * sets* over the same rows (see `comparison-columns.ts`), and the cache table
 * carries both metric families' columns on every row, so splitting each row in
 * two was pure ceremony. The reader always `select('*')`s, so each row is a
 * superset of `StatsCacheBySpeciesResult` — the extra raw cache columns (`id`,
 * `group_id`, `species_id`, `temporal_unit`) ride along unread, the same
 * narrowing `app/actions/sp-data.ts`'s `fetchSpeciesStatsCacheRows` does.
 *
 * Two behaviour-neutral consequences of delegating:
 *
 * - `readStatsCacheRows` resolves a missing embed to `species_name: null`,
 *   where this action's old mapper coalesced to `''`. Every by-species cache
 *   row has a non-null `species_id` FK so the embed always resolves — the same
 *   assumption `fetchSpeciesStatsCacheRows` makes, and what makes the single
 *   `as StatsCacheBySpeciesResult[]` narrowing below honest.
 * - Rows now arrive ordered by `time_period`, then embedded
 *   `Species(species_name)`. At the `all-time` grain there is one
 *   `time_period`, and neither the pill list (sorted by `listAvailableSpecies`)
 *   nor the table rows (selection order, via `selectComparisonRows`) depend on
 *   the fetch order, so nothing visible changes.
 */
export async function fetchSpeciesComparisonStats(
	viewedGroup: ViewedGroup
): Promise<StatsCacheBySpeciesResult[]> {
	const rows = await readStatsCacheRows({
		viewedGroup,
		bySpecies: true,
		temporalUnit: 'all-time'
	});
	return rows as StatsCacheBySpeciesResult[];
}
