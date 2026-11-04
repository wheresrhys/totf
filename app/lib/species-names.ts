import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPaginatedRows } from '@/lib/supabase';

/**
 * Resolves `species_id` → `species_name` for a set of ids, for a caller that
 * got rows back from an RPC keyed on `species_id` rather than `species_name`
 * — an RPC result can't carry a PostgREST embed, so there is no
 * `Species(species_name)` to flatten on for free the way a direct table read
 * gets. Only the ids actually present are requested; `Species` is global
 * reference data (`USING (TRUE)` SELECT policy), so the authenticated client
 * reads it unconditionally. Paginated for the same reason any
 * `fetchAllPaginatedRows` read is: a group with more species than one
 * PostgREST page would otherwise silently lose the names of the overflow.
 *
 * Shared by `app/actions/spp-data.ts` (`readBiometricsFromMetricsRpc`) and
 * `app/lib/auth/group-summary-access.ts` (`runLiveMetricsRecompute`) — both
 * read a `stats_cache_*_metrics` RPC's `species_id`-keyed rows and need the
 * same join back to a display name. Lives outside both of those files'
 * modules rather than in either one, since `group-summary-access.ts` (under
 * `app/lib/auth/`) importing from `app/actions/` would be a backwards
 * layering dependency.
 */
export async function readSpeciesNamesById(
	client: SupabaseClient,
	speciesIds: number[]
): Promise<Map<number, string>> {
	type SpeciesNameRow = { id: number; species_name: string };
	const rows = await fetchAllPaginatedRows<SpeciesNameRow>((fromRow, toRow) =>
		client
			.from('Species')
			.select<string, SpeciesNameRow>('id, species_name')
			.in('id', speciesIds)
			.order('id')
			.range(fromRow, toRow)
	);
	return new Map(rows.map(({ id, species_name }) => [id, species_name]));
}
