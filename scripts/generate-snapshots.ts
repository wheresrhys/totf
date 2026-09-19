#!/usr/bin/env tsx
/**
 * Generate snapshot JSON fixtures from the local e2e seed data.
 *
 * **Every fixture is the raw, unmodified return of exactly one RPC call or one
 * table query.** Never merge two sources into one file, and never post-process a
 * result before writing it: a fixture that isn't a verbatim source response can't
 * be checked against any source, and quietly starts asserting the shape of the
 * merge instead of the shape of the database. Where an action joins two sources
 * (e.g. core_stats + biometrics_stats), write one fixture per source and let the
 * consuming test perform the same join the action does, with the same helper.
 *
 * Reads Alpha/Beta/Gamma group data and writes 27 JSON files under
 * test-fixtures/snapshots/, organised into one subdirectory per data source —
 * the RPC name for RPC-backed fixtures (`core_stats/`, `biometrics_stats/`,
 * `demographics_stats/`, `find_discrepencies/`, `notable_retraps/`,
 * `ring_sequence_controls/`) and `tables/<TableName>/`
 * for fixtures produced by a direct PostgREST table query. The comment above
 * each block below names both the RPC/table and the consuming action(s) — keep
 * this in sync when a call site's underlying RPC/table changes, so a fixture's
 * location never silently drifts from what it actually tests (see #870, #882).
 * Every `tables/<TableName>/` block's `.select()` string comes from a named
 * query definition in `queries/<TableName>/`, the same one the real app call
 * site imports — see `queries/types.ts` (#913).
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
import {
	allSessionsQuery,
	recentSessionsQuery,
	pulliEncountersQuery,
	resightingsQuery,
	topSpeciesQuery,
	pageOfBirdsQuery,
	birdDetailQuery
} from '../queries';

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
	// `tables/Birds/arretrap.bird.json`.
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

	// RPC: biometrics_stats (group_by_species) — powers fetchSpeciesData's
	// biometrics half (app/actions/spp-data.ts), merged onto the core_stats
	// by-species rows above by mergeSpeciesBiometrics (app/lib/species-stats.ts)
	for (const [name, client, gId] of [
		['alpha', alpha, alphaId],
		['gamma', gamma, gammaId]
	] as const) {
		const { data } = await client.rpc('biometrics_stats', {
			ringing_group_filter: gId,
			group_by_species: true
		});
		await writeSnapshot(`biometrics_stats/${name}.by-species.json`, data ?? []);
	}

	// RPC: core_stats (yearly, ungrouped by species) — powers fetchPayOffStats
	// (app/actions/pay-off-stats.ts)
	for (const [name, client, gId] of [
		['alpha', alpha, alphaId],
		['beta', beta, betaId]
	] as const) {
		const { data: yearly } = await client.rpc('core_stats', {
			ringing_group_filter: gId,
			group_by_species: false,
			group_by_time_period: 'year'
		});
		await writeSnapshot(`core_stats/${name}.yearly-totals.json`, yearly ?? []);
	}

	// RPC: core_stats (monthly, ungrouped by species) — powers fetchPayOffStats
	// (app/actions/pay-off-stats.ts)
	for (const [name, client, gId] of [
		['alpha', alpha, alphaId],
		['beta', beta, betaId]
	] as const) {
		const { data: monthly } = await client.rpc('core_stats', {
			ringing_group_filter: gId,
			group_by_species: false,
			group_by_time_period: 'month'
		});
		await writeSnapshot(
			`core_stats/${name}.monthly-totals.json`,
			monthly ?? []
		);
	}

	// Table: Sessions (embedded Locations + Encounters count) — powers
	// fetchSessionsPageContent (app/(routes)/sessions/page.tsx). Query:
	// queries/Sessions/all-sessions.ts
	for (const [name, client, gId] of [
		['alpha', alpha, alphaId],
		['beta', beta, betaId]
	] as const) {
		const { data } = await client
			.from('Sessions')
			.select(allSessionsQuery.select)
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
	// (app/(routes)/pulli/page.tsx). Query: queries/Encounters/pulli-encounters.ts
	{
		const { data } = await alpha
			.from('Encounters')
			.select(pulliEncountersQuery.select)
			.eq('ringing_group_id', alphaId)
			.eq('session.session_type', 'PULLI');
		await writeSnapshot(
			`tables/Encounters/alpha.pulli-encounters.json`,
			data ?? []
		);
	}

	// Table: Encounters (resighting record types) — powers
	// fetchResightingsPageContent (app/(routes)/resightings/page.tsx). Query:
	// queries/Encounters/resightings.ts
	{
		const { data } = await alpha
			.from('Encounters')
			.select(resightingsQuery.select)
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
	// fetchRecentSessions (app/(routes)/page.tsx). Query:
	// queries/Sessions/recent-sessions.ts
	const { data: recentSessions } = await alpha
		.from('Sessions')
		.select(recentSessionsQuery.select)
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
	// since the raw DB read is what a shape drift would actually break. Query:
	// queries/Species/top-species.ts
	{
		const { data: topSpecies } = await alpha
			.from('Species')
			.select(topSpeciesQuery.select);
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
		// fetchPageOfBirds (app/actions/sp-data.ts). Query:
		// queries/Birds/page-of-birds.ts
		const { data: birdsPage0 } = await alpha
			.from('Birds')
			.select(pageOfBirdsQuery.select)
			.eq('species_id', robinSpecies.id)
			.contains('ringing_group_ids', [alphaId])
			.order('last_encountered_timestamp', { ascending: false })
			.range(0, BATCH_SIZE - 1);
		await writeSnapshot(
			`tables/Birds/robin-alpha.page-of-birds.json`,
			birdsPage0 ?? []
		);

		// RPC: biometrics_stats (species-filtered, ungrouped — a single headline
		// row) — powers getSpeciesStats (app/(routes)/species/[speciesName]/page.tsx),
		// merged onto that page's single core_stats row
		const { data: robinBiometrics } = await alpha.rpc('biometrics_stats', {
			species_name_filter: 'Robin',
			ringing_group_filter: alphaId
		});
		await writeSnapshot(
			`biometrics_stats/robin-alpha.headline.json`,
			robinBiometrics ?? []
		);

		// RPC: demographics_stats (species-filtered, group_by_time_period: month) —
		// powers getSpeciesDemographicsStats (app/actions/sp-data.ts), which backs
		// the species page's Demographics tab. Renamed from population_stats in
		// #878; only ever called species-filtered and time-grouped.
		const { data: robinDemographics } = await alpha.rpc('demographics_stats', {
			species_name_filter: 'Robin',
			ringing_group_filter: alphaId,
			group_by_time_period: 'month'
		});
		await writeSnapshot(
			`demographics_stats/robin-alpha.monthly-history.json`,
			robinDemographics ?? []
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

		// The raw source behind the species/[speciesName] page's headline
		// stats, whose biometrics_stats sibling is
		// `biometrics_stats/robin-alpha.headline.json` above — getSpeciesStats
		// joins the two with mergeBiometricsFields. The page's other inputs need
		// no fixture here: its page of Birds is already
		// tables/Birds/robin-alpha.page-of-birds.json, speciesId/speciesName are
		// route-resolved props, not RPC output, and fetchGraphableEncounterData's
		// chart data (`Birds` + embedded `Encounters`) has no consumer that reads
		// it from a fixture — the one test exercising it mocks the action
		// directly with a small inline array, so a generated fixture here would
		// just be dead weight (#894).
		const { data: robinStats } = await alpha.rpc('core_stats', {
			species_name_filter: 'Robin',
			ringing_group_filter: alphaId
		});
		await writeSnapshot(
			`core_stats/robin-alpha.headline.json`,
			robinStats ?? []
		);
	}

	// Table: Birds — the fetchBirdPageContent (app/(routes)/bird/[ring]/page.tsx)
	// bird-detail query, split by #901 from the compound
	// tables/Birds/arretrap.bird-detail.json fixture into its two raw sources.
	// Filed under tables/Birds/ since Birds (by ring_no) is the entity the page
	// is keyed on; Encounters is a secondary query merged into the same object.
	// The Birds portion's query is queries/Birds/bird-detail.ts; the Encounters
	// portion stays inline here rather than being extracted, since it's
	// deliberately narrower than the real page's own Encounters select — see
	// that query file's comment for why.
	const { data: arretrapBird } = await alpha
		.from('Birds')
		.select(birdDetailQuery.select)
		.eq('ring_no', 'ARRETRAP')
		.maybeSingle();
	await writeSnapshot(`tables/Birds/arretrap.bird.json`, arretrapBird ?? null);

	// Table: Encounters — the same page's encounters-of-bird query, merged
	// onto the Birds row above by fetchBirdPageContent itself. Filed under
	// tables/Encounters/ (its own source table) even though it's keyed off
	// the Birds row fetched above.
	if (arretrapBird) {
		const { data: encounters } = await alpha
			.from('Encounters')
			.select(
				`bird_id, id, age_code, is_juv, capture_time, max_hatch_year, min_hatch_year, record_type, sex, ringing_group_id, weight, wing_length, session:Sessions(visit_date)`
			)
			.eq('bird_id', arretrapBird.id);
		await writeSnapshot(
			`tables/Encounters/arretrap.encounters.json`,
			encounters ?? []
		);
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
