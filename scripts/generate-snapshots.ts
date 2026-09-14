#!/usr/bin/env tsx
/**
 * Generate snapshot JSON fixtures from the local e2e seed data.
 *
 * Reads Alpha/Beta/Gamma group data and writes 21 JSON files under
 * test-fixtures/snapshots/, organised into one subdirectory per data source —
 * the RPC name for RPC-backed fixtures (`core_stats/`, `find_discrepencies/`,
 * `notable_retraps/`, `top_metrics_by_period/`, `ring_sequence_controls/`) and
 * `tables/<TableName>/` for fixtures produced by a direct PostgREST table
 * query. The comment above each block below names both the RPC/table and the
 * consuming action(s) — keep this in sync when a call site's underlying
 * RPC/table changes, so a fixture's location never silently drifts from what
 * it actually tests (see #870, #882).
 *
 * The only fixtures under test-fixtures/snapshots/ this script does not write
 * are the two under `synthetic/` — hand-authored zero-activity edge cases, not
 * captured query results (see that directory's own note, #894).
 *
 * Run via: npm run db:generate-snapshots
 * Or called programmatically: generateSnapshots(alphaId, betaId, gammaId)
 */

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs/promises';
import { supabase } from '../lib/supabase';
import { getAuthenticatedSupabaseClientForGroup } from '../app/lib/auth/group-auth';
import { RESIGHTING_RECORD_TYPES } from '../lib/demon-import';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SNAPSHOTS_DIR = path.join(ROOT, 'test-fixtures', 'snapshots');

async function getGroupId(name: string): Promise<number> {
	const { data, error } = await supabase
		.from('RingingGroups')
		.select('id')
		.eq('group_name', name)
		.single();
	if (error || !data)
		throw new Error(`Group "${name}" not found: ${error?.message}`);
	return data.id;
}

// `relativePath` is a source-directory-relative path, e.g.
// `core_stats/alpha.by-species.json` or `tables/Birds/arretrap.bird-detail.json`.
async function writeSnapshot(relativePath: string, data: unknown) {
	const target = path.join(SNAPSHOTS_DIR, relativePath);
	await fs.mkdir(path.dirname(target), { recursive: true });
	await fs.writeFile(target, JSON.stringify(data, null, 2));
	console.log(`  → ${relativePath}`);
}

export async function generateSnapshots(
	alphaId: number,
	betaId: number,
	gammaId: number
) {
	console.log('\nGenerating snapshots...');

	const alpha = await getAuthenticatedSupabaseClientForGroup(alphaId);
	const beta = await getAuthenticatedSupabaseClientForGroup(betaId);
	const gamma = await getAuthenticatedSupabaseClientForGroup(gammaId);

	// RPC: core_stats (group_by_species) — powers fetchSpeciesData
	// (app/actions/spp-data.ts)
	for (const [name, client, gId] of [
		['alpha', alpha, alphaId],
		['beta', beta, betaId],
		['gamma', gamma, gammaId]
	] as const) {
		const { data } = await client.rpc('core_stats', {
			ringing_group_filter: gId,
			group_by_species: true
		});
		await writeSnapshot(`core_stats/${name}.by-species.json`, data ?? []);
	}

	// RPC: core_stats (ungrouped, no time period, no date range) — powers
	// fetchSummaryStats (app/actions/summary-stats.ts) called with no
	// fromDate/toDate, i.e. the base /summary route's all-time totals.
	{
		const { data } = await alpha.rpc('core_stats', {
			ringing_group_filter: alphaId
		});
		await writeSnapshot(
			`core_stats/alpha.summary-totals.json`,
			data?.[0] ?? null
		);
	}

	// RPC: core_stats (yearly + monthly, ungrouped by species) — powers
	// fetchPayOffStats (app/actions/pay-off-stats.ts)
	for (const [name, client, gId] of [
		['alpha', alpha, alphaId],
		['beta', beta, betaId]
	] as const) {
		const [{ data: yearly }, { data: monthly }] = await Promise.all([
			client.rpc('core_stats', {
				ringing_group_filter: gId,
				group_by_species: false,
				group_by_time_period: 'year'
			}),
			client.rpc('core_stats', {
				ringing_group_filter: gId,
				group_by_species: false,
				group_by_time_period: 'month'
			})
		]);
		await writeSnapshot(`core_stats/${name}.yearly-and-monthly-totals.json`, {
			yearly: yearly ?? [],
			monthly: monthly ?? []
		});
	}

	// Table: Sessions (embedded Locations + Encounters count) — powers
	// fetchAllSessions (app/(routes)/sessions/page.tsx)
	for (const [name, client, gId] of [
		['alpha', alpha, alphaId],
		['beta', beta, betaId]
	] as const) {
		const { data } = await client
			.from('Sessions')
			.select(
				'id, visit_date, location: Locations(id, location_name), encounters:Encounters(count)'
			)
			.eq('ringing_group_id', gId)
			.order('visit_date', { ascending: false });
		await writeSnapshot(
			`tables/Sessions/${name}.all-sessions.json`,
			data ?? []
		);
	}

	// RPC: find_discrepencies — powers fetchMistakesPageContent
	// (app/(routes)/mistakes/page.tsx). Alpha only — a `beta.discrepancies.json`
	// counterpart existed here previously but was never consumed by any test
	// (confirmed by grep and `tsc --listFilesOnly`); removed as an orphan
	// rather than kept generating an unused file (#894).
	for (const [name, client, gId] of [['alpha', alpha, alphaId]] as const) {
		const { data } = await client.rpc('find_discrepencies', {
			ringing_group_filter: gId
		});
		await writeSnapshot(
			`find_discrepencies/${name}.discrepancies.json`,
			data ?? []
		);
	}

	// RPC: notable_retraps (group-wide) — powers fetchNotableRetrapsPageContent
	// (app/(routes)/retraps/page.tsx). Alpha only — see the find_discrepencies
	// block above; `beta.retraps.json` was the same kind of orphan (#894).
	for (const [name, client, gId] of [['alpha', alpha, alphaId]] as const) {
		const { data } = await client.rpc('notable_retraps', {
			ringing_group_filter: gId,
			result_limit_per_species: 5,
			min_proven_age: 3,
			min_encounter_count: 6
		});
		await writeSnapshot(`notable_retraps/${name}.retraps.json`, data ?? []);
	}

	// Table: Encounters (PULLI session type) — powers fetchPulliPageContent
	// (app/(routes)/pulli/page.tsx)
	{
		const { data } = await alpha
			.from('Encounters')
			.select(
				`
				id,
				extra_text,
				bird:Birds (
					ring_no,
					species:Species (
						species_name
					)
				),
				session:Sessions!inner (
					visit_date,
					session_type,
					location:Locations (
						location_name
					)
				)
			`
			)
			.eq('ringing_group_id', alphaId)
			.eq('session.session_type', 'PULLI');
		await writeSnapshot(
			`tables/Encounters/alpha.pulli-encounters.json`,
			data ?? []
		);
	}

	// Table: Encounters (resighting record types) — powers
	// fetchResightingsPageContent (app/(routes)/resightings/page.tsx)
	{
		const { data } = await alpha
			.from('Encounters')
			.select(
				`
				id,
				record_type,
				extra_text,
				finding_condition,
				finding_circumstances,
				bird:Birds (
					ring_no,
					species:Species (
						species_name
					)
				),
				session:Sessions (
					visit_date,
					location:Locations (
						location_name
					)
				)
			`
			)
			.eq('ringing_group_id', alphaId)
			.in('record_type', [...RESIGHTING_RECORD_TYPES]);
		await writeSnapshot(`tables/Encounters/alpha.resightings.json`, data ?? []);
	}

	// RPC: ring_sequence_controls — powers fetchRingSequenceControls
	// (app/actions/ring-sequences.ts)
	{
		const { data } = await alpha.rpc('ring_sequence_controls', {
			ringing_group_filter: alphaId
		});
		await writeSnapshot(
			`ring_sequence_controls/alpha.controls.json`,
			data ?? []
		);
	}

	// Table: Sessions (Alpha only, most-recent visit date) — powers
	// fetchRecentSessions (app/(routes)/page.tsx)
	const { data: recentSessions } = await alpha
		.from('Sessions')
		.select(
			'id, visit_date, location_id, ringing_group_id, location:Locations(location_name), encounters:Encounters(count)'
		)
		.eq('ringing_group_id', alphaId)
		.order('visit_date', { ascending: false })
		.limit(3);
	await writeSnapshot(
		`tables/Sessions/alpha.recent-sessions.json`,
		recentSessions ?? []
	);

	// Table: Species (embedded Birds count, unfiltered/unsliced) — powers
	// fetchTopSpecies (app/(routes)/page.tsx); the action itself filters to
	// birds count > 0, sorts descending and slices to the top 10 client-side —
	// this fixture is the raw query result before that in-memory processing,
	// since the raw DB read is what a shape drift would actually break.
	{
		const { data: topSpecies } = await alpha
			.from('Species')
			.select('id, species_name, birds:Birds(count)');
		await writeSnapshot(
			`tables/Species/alpha.top-species.json`,
			topSpecies ?? []
		);
	}

	// RPC: core_stats (allTime/thisYear/lastYear composite, ungrouped) — powers
	// fetchHomePageSummaryStats (app/(routes)/page.tsx)
	{
		const currentYear = new Date().getFullYear();
		const startOfCurrentYear = `${currentYear}-01-01`;
		const startOfLastYear = `${currentYear - 1}-01-01`;
		const endOfLastYear = `${currentYear - 1}-12-31`;
		const [{ data: allTime }, { data: thisYear }, { data: lastYear }] =
			await Promise.all([
				alpha.rpc('core_stats', { ringing_group_filter: alphaId }),
				alpha.rpc('core_stats', {
					ringing_group_filter: alphaId,
					from_date: startOfCurrentYear
				}),
				alpha.rpc('core_stats', {
					ringing_group_filter: alphaId,
					from_date: startOfLastYear,
					to_date: endOfLastYear
				})
			]);
		await writeSnapshot(`core_stats/alpha.home-page-summary.json`, {
			allTime: allTime?.[0] ?? null,
			thisYear: thisYear?.[0] ?? null,
			lastYear: lastYear?.[0] ?? null
		});
	}

	// Robin species ID (needed for species-specific snapshots)
	const { data: robinSpecies } = await alpha
		.from('Species')
		.select('id')
		.eq('species_name', 'Robin')
		.single();

	if (robinSpecies) {
		const BATCH_SIZE = 20;

		// Table: Birds (embedded Encounters/Sessions, page 0) — powers
		// fetchPageOfBirds (app/actions/sp-data.ts)
		const { data: birdsPage0 } = await alpha
			.from('Birds')
			.select(
				`id, ring_no, last_encountered_timestamp, ringing_group_ids, proven_age,
				encounters:Encounters(id,capture_time,min_hatch_year,max_hatch_year,age_code,is_juv,record_type,sex,weight,wing_length,session:Sessions(id,visit_date))`
			)
			.eq('species_id', robinSpecies.id)
			.contains('ringing_group_ids', [alphaId])
			.order('last_encountered_timestamp', { ascending: false })
			.range(0, BATCH_SIZE - 1);
		await writeSnapshot(
			`tables/Birds/robin-alpha.page-of-birds.json`,
			birdsPage0 ?? []
		);

		// RPC: notable_retraps (species-filtered) — powers fetchNotableRetraps
		// (app/actions/sp-data.ts)
		const { data: robinRetraps } = await alpha.rpc('notable_retraps', {
			ringing_group_filter: alphaId,
			species_filter: 'Robin',
			result_limit: 10,
			min_proven_age: 3,
			min_encounter_count: 6
		});
		await writeSnapshot(
			`notable_retraps/robin-alpha.retraps.json`,
			robinRetraps ?? []
		);

		// Composite: RPC top_metrics_by_period + RPC core_stats + the Birds
		// page fetched above — powers the species/[speciesName] page's headline
		// stats, busiest-sessions and individuals data. Filed under
		// core_stats/ since `speciesStats` (a core_stats row) is the
		// field most exposed to silent RPC-shape drift — the same risk class
		// that caused #870; `topSessions` and `birds` piggy-back on this fixture
		// for convenience rather than getting a fixture each.
		const [{ data: topSessions }, { data: robinStats }] = await Promise.all([
			alpha.rpc('top_metrics_by_period', {
				temporal_unit: 'day',
				metric_name: 'encounters',
				result_limit: 5,
				filters: {
					species_filter: 'Robin',
					ringing_group_filter: alphaId
				}
			} as Parameters<typeof alpha.rpc<'top_metrics_by_period'>>[1]),
			alpha.rpc('core_stats', {
				species_name_filter: 'Robin',
				ringing_group_filter: alphaId
			})
		]);
		if (birdsPage0 && birdsPage0.length > 0) {
			await writeSnapshot(
				`core_stats/robin-alpha.species-page-composite.json`,
				{
					topSessions: topSessions ?? [],
					birds: birdsPage0,
					speciesStats: robinStats?.[0] ?? null,
					speciesId: robinSpecies.id,
					speciesName: 'Robin'
				}
			);
		}
	}

	// RPC: top_metrics_by_period (busiest single day, group-wide) — powers
	// getTopPeriodsByMetric (app/actions/top-performers.ts)
	const { data: topDays } = await alpha.rpc('top_metrics_by_period', {
		temporal_unit: 'day',
		metric_name: 'encounters',
		result_limit: 1,
		filters: { ringing_group_filter: alphaId }
	} as Parameters<typeof alpha.rpc<'top_metrics_by_period'>>[1]);
	await writeSnapshot(
		`top_metrics_by_period/alpha.busiest-days.json`,
		topDays ?? []
	);

	// Table: Birds + Table: Encounters (bird detail merged with its own
	// encounters) — powers fetchBirdPageContent (app/(routes)/bird/[ring]/page.tsx).
	// Filed under tables/Birds/ since Birds (by ring_no) is the entity the page
	// is keyed on; Encounters is a secondary query merged into the same object.
	const { data: arretrapBird } = await alpha
		.from('Birds')
		.select(`id, ring_no, proven_age, species:Species(species_name)`)
		.eq('ring_no', 'ARRETRAP')
		.maybeSingle();
	if (arretrapBird) {
		const { data: encounters } = await alpha
			.from('Encounters')
			.select(
				`bird_id, id, age_code, is_juv, capture_time, max_hatch_year, min_hatch_year, record_type, sex, ringing_group_id, weight, wing_length, session:Sessions(visit_date)`
			)
			.eq('bird_id', arretrapBird.id);
		await writeSnapshot(`tables/Birds/arretrap.bird-detail.json`, {
			...arretrapBird,
			encounters: encounters ?? []
		});
	}

	console.log('\nSnapshots generated successfully!');
}

async function main() {
	const alphaId = await getGroupId('Alpha');
	const betaId = await getGroupId('Beta');
	const gammaId = await getGroupId('Gamma');
	console.log(`Groups: Alpha(${alphaId}), Beta(${betaId}), Gamma(${gammaId})`);
	await generateSnapshots(alphaId, betaId, gammaId);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	main()
		.then(() => {
			console.log('\n✓ Snapshots complete');
			process.exit(0);
		})
		.catch((err) => {
			console.error('\nSnapshot generation failed:', err);
			process.exit(1);
		});
}
