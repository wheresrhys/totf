#!/usr/bin/env tsx
/**
 * Generate snapshot JSON fixtures from the local e2e seed data.
 *
 * Reads Alpha/Beta/Gamma group data and writes 25 JSON files under
 * test-fixtures/snapshots/, organised into one subdirectory per data source —
 * the RPC name for RPC-backed fixtures (`core_stats/`, `biometrics_stats/`,
 * `find_discrepencies/`, `notable_retraps/`, `top_metrics_by_period/`) and
 * `tables/<TableName>/` for fixtures produced by a direct PostgREST table
 * query. The comment above each block below names both the RPC/table and the
 * consuming action(s) — keep this in sync when a call site's underlying
 * RPC/table changes, so a fixture's location never silently drifts from what it
 * actually tests (see #870, #882).
 *
 * **Every fixture is the raw, unmodified return of exactly one RPC call or one
 * table query.** Never merge two sources into one file, and never post-process a
 * result before writing it: a fixture that isn't a verbatim source response can't
 * be checked against any source, and quietly starts asserting the shape of the
 * merge instead of the shape of the database. Where an action joins two sources
 * (e.g. core_stats + biometrics_stats), write one fixture per source and let the
 * consuming test perform the same join the action does, with the same helper —
 * see app/__tests__/helpers/species-stats-fixtures.ts. Two fixtures below still
 * break this rule and are grandfathered pending #901: the
 * `*.yearly-and-monthly-totals.json` pair (two core_stats calls in one file) and
 * `tables/Birds/arretrap.bird-detail.json` (a Birds row with an Encounters query
 * spliced on). Don't add a third.
 *
 * Not every fixture under test-fixtures/snapshots/ is written by this script —
 * `ring_sequence_controls/`, `tables/Encounters/`, `tables/Species/`, and a few
 * files alongside generated ones under `core_stats/` (the
 * `*.summary-totals.json` / `*.home-page-summary.json` pairs) are still
 * hand-maintained (see CLAUDE.md's "App tests" section). They were moved to
 * their correct source directory by #882 but not wired up for generation here
 * — that's a separate follow-up.
 *
 * Run via: npm run db:generate-snapshots
 * Or called programmatically: generateSnapshots(alphaId, betaId, gammaId)
 */

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs/promises';
import { supabase } from '../lib/supabase';
import { getAuthenticatedSupabaseClientForGroup } from '../app/lib/auth/group-auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
export const SNAPSHOTS_DIR = path.join(ROOT, 'test-fixtures', 'snapshots');

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

export async function generateSnapshots(
	alphaId: number,
	betaId: number,
	gammaId: number,
	// Defaults to the committed fixture directory; the fixture-freshness DB
	// integration test (supabase/__tests__/snapshot-fixture-freshness.test.ts)
	// passes a temp directory so it can diff without touching the repo.
	outputDir: string = SNAPSHOTS_DIR
) {
	// `relativePath` is a source-directory-relative path, e.g.
	// `core_stats/alpha.by-species.json` or
	// `tables/Birds/arretrap.bird-detail.json`.
	const writeSnapshot = async (relativePath: string, data: unknown) => {
		const target = path.join(outputDir, relativePath);
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.writeFile(target, JSON.stringify(data, null, 2));
		console.log(`  → ${relativePath}`);
	};

	console.log('\nGenerating snapshots...');

	const alpha = await getAuthenticatedSupabaseClientForGroup(alphaId);
	const beta = await getAuthenticatedSupabaseClientForGroup(betaId);
	const gamma = await getAuthenticatedSupabaseClientForGroup(gammaId);

	// RPC: core_stats (group_by_species) and RPC: biometrics_stats
	// (group_by_species) — the two halves fetchSpeciesData
	// (app/actions/spp-data.ts) joins with mergeSpeciesBiometrics after #821/#823
	// moved the 8 wing/weight columns out of core_stats. Each is written as its
	// own raw fixture; the tests that need the merged row do the merge
	// themselves, exactly as the action does (see
	// app/__tests__/helpers/species-stats-fixtures.ts).
	for (const [name, client, gId] of [
		['alpha', alpha, alphaId],
		['beta', beta, betaId],
		['gamma', gamma, gammaId]
	] as const) {
		const [{ data: coreRows }, { data: biometricsRows }] = await Promise.all([
			client.rpc('core_stats', {
				ringing_group_filter: gId,
				group_by_species: true
			}),
			client.rpc('biometrics_stats', {
				ringing_group_filter: gId,
				group_by_species: true
			})
		]);
		await writeSnapshot(`core_stats/${name}.by-species.json`, coreRows ?? []);
		await writeSnapshot(
			`biometrics_stats/${name}.by-species.json`,
			biometricsRows ?? []
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
	// (app/(routes)/mistakes/page.tsx)
	for (const [name, client, gId] of [
		['alpha', alpha, alphaId],
		['beta', beta, betaId]
	] as const) {
		const { data } = await client.rpc('find_discrepencies', {
			ringing_group_filter: gId
		});
		await writeSnapshot(
			`find_discrepencies/${name}.discrepancies.json`,
			data ?? []
		);
	}

	// RPC: notable_retraps (group-wide) — powers fetchNotableRetrapsPageContent
	// (app/(routes)/retraps/page.tsx)
	for (const [name, client, gId] of [
		['alpha', alpha, alphaId],
		['beta', beta, betaId]
	] as const) {
		const { data } = await client.rpc('notable_retraps', {
			ringing_group_filter: gId,
			result_limit_per_species: 5,
			min_proven_age: 3,
			min_encounter_count: 6
		});
		await writeSnapshot(`notable_retraps/${name}.retraps.json`, data ?? []);
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

		// RPC: core_stats (species-filtered, group_by_time_period: month) and RPC:
		// biometrics_stats (same params) — the two halves getSpeciesStatsHistory
		// (app/actions/sp-data.ts) joins on time_period with mergeBiometricsFields
		// (#821). One raw fixture each; the join belongs to whoever consumes them.
		const [{ data: robinHistory }, { data: robinHistoryBiometrics }] =
			await Promise.all([
				alpha.rpc('core_stats', {
					species_name_filter: 'Robin',
					ringing_group_filter: alphaId,
					group_by_time_period: 'month'
				}),
				alpha.rpc('biometrics_stats', {
					species_name_filter: 'Robin',
					ringing_group_filter: alphaId,
					group_by_time_period: 'month'
				})
			]);
		await writeSnapshot(
			`core_stats/robin-alpha.monthly-history.json`,
			robinHistory ?? []
		);
		await writeSnapshot(
			`biometrics_stats/robin-alpha.monthly-history.json`,
			robinHistoryBiometrics ?? []
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

		// Table: Birds (embedded Encounters only, for charting) — powers
		// fetchGraphableEncounterData (app/actions/sp-data.ts)
		const { data: graphableData } = await alpha
			.from('Birds')
			.select(`encounters:Encounters(age_code,sex,weight,wing_length)`)
			.eq('species_id', robinSpecies.id)
			.contains('ringing_group_ids', [alphaId]);
		await writeSnapshot(
			`tables/Birds/robin-alpha.graphable-encounters.json`,
			graphableData ?? []
		);

		// The three raw sources behind the species/[speciesName] page
		// (app/(routes)/species/[speciesName]/page.tsx): its busiest-sessions list
		// (top_metrics_by_period), and the core_stats + biometrics_stats halves of
		// its headline `speciesStats` row, which the page joins with
		// mergeBiometricsFields. One fixture per RPC — the page's fourth input,
		// its page of Birds, is already covered by
		// tables/Birds/robin-alpha.page-of-birds.json above.
		const [{ data: topSessions }, { data: robinStats }, { data: robinBio }] =
			await Promise.all([
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
				}),
				alpha.rpc('biometrics_stats', {
					species_name_filter: 'Robin',
					ringing_group_filter: alphaId
				})
			]);
		await writeSnapshot(
			`top_metrics_by_period/robin-alpha.top-sessions.json`,
			topSessions ?? []
		);
		await writeSnapshot(
			`core_stats/robin-alpha.species-stats.json`,
			robinStats ?? []
		);
		await writeSnapshot(
			`biometrics_stats/robin-alpha.species-stats.json`,
			robinBio ?? []
		);
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
