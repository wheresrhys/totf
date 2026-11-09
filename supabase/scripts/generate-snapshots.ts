#!/usr/bin/env tsx
/**
 * Generate snapshot JSON fixtures from the local e2e seed data.
 *
 * **Every fixture is the raw, unmodified return of exactly one RPC call or one
 * table query.** Never merge two sources into one file, and never post-process a
 * result before writing it: a fixture that isn't a verbatim source response can't
 * be checked against any source, and quietly starts asserting the shape of the
 * merge instead of the shape of the database. Where an action joins two sources
 * (e.g. a core_stats row plus the wing/weight columns alongside it), write one
 * fixture per source and let the consuming test perform the same join the
 * action does, with the same helper.
 *
 * Reads Alpha/Beta/Gamma group data and writes 26 JSON files under
 * test-fixtures/snapshots/, organised into one subdirectory per data source —
 * the RPC name for RPC-backed fixtures (`demographics_stats/`,
 * `find_discrepencies/`, `notable_retraps/`, `ring_sequence_controls/`,
 * `stats_cache_biometrics_metrics/`) and `tables/<TableName>/`
 * for fixtures produced by a direct PostgREST table query — including
 * `tables/SimpleStatsCache/` and `tables/SimpleStatsCacheBySpecies/`, the
 * real current source for every fixture that used to come from a live
 * `core_stats` RPC call (#1244 — that RPC has no remaining app call site).
 * The comment above
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
import { supabase } from '../../lib/supabase';
import { getAuthenticatedSupabaseClientForGroup } from '../../app/lib/auth/group-auth';
import type { StatsTemporalUnit } from '@/app/models/temporal-unit';
import {
	allSessionsQuery,
	recentSessionsQuery,
	pulliEncountersQuery,
	resightingsQuery,
	topSpeciesQuery,
	pageOfBirdsQuery,
	birdDetailQuery,
	arretrapEncountersQuery,
	simpleStatsCacheSummaryTotalsQuery,
	simpleStatsCacheYearlyTotalsQuery,
	simpleStatsCacheMonthlyTotalsQuery,
	simpleStatsCacheHomePageSummaryQuery,
	simpleStatsCacheBySpeciesByQuery,
	simpleStatsCacheBySpeciesHeadlineQuery,
	ownGroupImportJobsQuery
} from '../../queries';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
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

type GroupSupabaseClient = Awaited<
	ReturnType<typeof getAuthenticatedSupabaseClientForGroup>
>;

/**
 * A raw `SimpleStatsCache`/`SimpleStatsCacheBySpecies` read, mirroring the
 * real app read path (`readStatsCacheRows`, `modules/stats/lib/stats-cache.ts`)
 * exactly — same table choice, same embed shape, same filters, same
 * ordering — but deliberately NOT calling that function: it flattens
 * `species_name` off the `Species` embed and strips the embed itself, and
 * per this file's own "no compound fixtures" rule a fixture must be the
 * verbatim response of one query. Keeping the raw embedded `Species` object
 * intact here means a consuming test can do that same flattening itself
 * (`app/__tests__/helpers/core-stats-fixtures.ts`), the same way the species
 * page's own production code does. `select` comes from the matching
 * `queries/SimpleStatsCache{,BySpecies}/` definition, per this file's own
 * "every select string comes from a named query definition" rule.
 */
async function readRawStatsCacheRows({
	client,
	groupId,
	bySpecies,
	select,
	speciesName,
	temporalUnit,
	timePeriod
}: {
	client: GroupSupabaseClient;
	groupId: number;
	bySpecies: boolean;
	select: string;
	speciesName?: string;
	temporalUnit: StatsTemporalUnit;
	timePeriod?: string;
}) {
	const tableName = bySpecies
		? 'SimpleStatsCacheBySpecies'
		: 'SimpleStatsCache';

	let filtered = client
		.from(tableName)
		.select(select)
		.eq('group_id', groupId)
		.eq('temporal_unit', temporalUnit);
	if (speciesName) {
		filtered = filtered.eq('Species.species_name', speciesName);
	}
	if (timePeriod) {
		filtered = filtered.eq('time_period', timePeriod);
	}
	const ordered = bySpecies
		? filtered.order('time_period').order('Species(species_name)')
		: filtered.order('time_period');

	const { data } = await ordered;
	return data ?? [];
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
	// `demographics_stats/robin-alpha.monthly-history.json` or
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

	// Table: SimpleStatsCacheBySpecies (all-time grain, every species) —
	// powers fetchSpeciesData (app/actions/spp-data.ts)'s cache-aligned
	// windows (the page's default and year-select views). Raw embed intact
	// (see readRawStatsCacheRows' own comment) — core-stats-fixtures.ts does
	// the species_name flattening a consuming test needs.
	for (const [name, client, gId] of [
		['alpha', alpha, alphaId],
		['beta', beta, betaId],
		['gamma', gamma, gammaId]
	] as const) {
		const data = await readRawStatsCacheRows({
			client,
			groupId: gId,
			bySpecies: true,
			select: simpleStatsCacheBySpeciesByQuery.select,
			temporalUnit: 'all-time'
		});
		await writeSnapshot(
			`tables/SimpleStatsCacheBySpecies/${name}.by-species.json`,
			data
		);
	}

	// RPC: stats_cache_biometrics_metrics (group_by_species) — part of
	// reinstating auto-generated biometrics fixtures (#1250/#1272) now that
	// #1246 deleted the old biometrics_stats RPC these used to come from.
	// Nothing reads this fixture yet — rewiring the app-test helper
	// (app/__tests__/helpers/biometrics-stats-fixtures.ts) to consume it is a
	// separate, dependent ticket. No Beta entry — the existing hand-rolled
	// biometrics fixtures never had one.
	for (const [name, client, gId] of [
		['alpha', alpha, alphaId],
		['gamma', gamma, gammaId]
	] as const) {
		const { data } = await client.rpc('stats_cache_biometrics_metrics', {
			ringing_group_filter: gId,
			group_by_species: true
		});
		await writeSnapshot(
			`stats_cache_biometrics_metrics/${name}.by-species.json`,
			data ?? []
		);
	}

	// Table: SimpleStatsCache (all-time grain) — powers fetchSummaryStats
	// (app/actions/summary-stats.ts) called with no fromDate/toDate, i.e. the
	// base /summary route's all-time totals. A single row (or none), matching
	// what the old ungrouped core_stats call returned as its one array
	// element.
	{
		const data = await readRawStatsCacheRows({
			client: alpha,
			groupId: alphaId,
			bySpecies: false,
			select: simpleStatsCacheSummaryTotalsQuery.select,
			temporalUnit: 'all-time'
		});
		await writeSnapshot(
			`tables/SimpleStatsCache/alpha.summary-totals.json`,
			data[0] ?? null
		);
	}

	// Table: SimpleStatsCache (year grain, every year) — powers
	// fetchPayOffStats (app/actions/pay-off-stats.ts)'s yearly table/chart.
	// Alpha only — the beta.yearly-totals.json counterpart was a fully
	// unconsumed orphan (confirmed by grep), dropped here rather than
	// migrated.
	{
		const data = await readRawStatsCacheRows({
			client: alpha,
			groupId: alphaId,
			bySpecies: false,
			select: simpleStatsCacheYearlyTotalsQuery.select,
			temporalUnit: 'year'
		});
		await writeSnapshot(
			`tables/SimpleStatsCache/alpha.yearly-totals.json`,
			data
		);
	}

	// Table: SimpleStatsCache (month grain, every month) — powers
	// fetchPayOffStats (app/actions/pay-off-stats.ts)'s monthly table/chart.
	// Alpha only — see yearly-totals above.
	{
		const data = await readRawStatsCacheRows({
			client: alpha,
			groupId: alphaId,
			bySpecies: false,
			select: simpleStatsCacheMonthlyTotalsQuery.select,
			temporalUnit: 'month'
		});
		await writeSnapshot(
			`tables/SimpleStatsCache/alpha.monthly-totals.json`,
			data
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

	// Table: Encounters (matching what used to be the PULLI session_type, dropped in #1024) — powers
	// fetchPulliPageContent (app/(routes)/pulli/page.tsx). Query:
	// queries/Encounters/pulli-encounters.ts
	{
		const { data } = await alpha
			.from('Encounters')
			.select(pulliEncountersQuery.select)
			.eq('ringing_group_id', alphaId)
			.eq('is_resighting', false)
			.eq('age_code', 1)
			.eq('is_juv', false);
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
			.eq('is_resighting', true);
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

	// Table: ImportJobs (most recent 20, Alpha only) — powers
	// fetchOwnGroupImportJobs (app/actions/import-jobs.ts), which backs the
	// /stats-consistency page's import-jobs table (#1388). Query:
	// queries/ImportJobs/own-group-import-jobs.ts
	{
		const { data: importJobs } = await alpha
			.from('ImportJobs')
			.select(ownGroupImportJobsQuery.select)
			.eq('ringing_group_id', alphaId)
			.order('started_at', { ascending: false })
			.limit(20);
		await writeSnapshot(
			`tables/ImportJobs/alpha.own-group-import-jobs.json`,
			importJobs ?? []
		);
	}

	// Table: Species (embedded Birds count, unfiltered/unsliced) — powers
	// fetchGroupSpecies (app/(routes)/page.tsx), which filters to birds count
	// > 0 for the home page's species-by-letter nav (#1025). This fixture is
	// the raw query result before that in-memory filtering, since the raw DB
	// read is what a shape drift would actually break. Query:
	// queries/Species/top-species.ts (name/fixture path kept as "top-species"
	// since the underlying query itself is unchanged)
	{
		const { data: topSpecies } = await alpha
			.from('Species')
			.select(topSpeciesQuery.select);
		await writeSnapshot(
			`tables/Species/alpha.top-species.json`,
			topSpecies ?? []
		);
	}

	// Table: SimpleStatsCache (the all-time cell, plus two picked rows out of
	// the year grain) — powers fetchHomePageSummaryStats
	// (app/(routes)/page.tsx), mirroring that function's own logic exactly
	// (#1221 moved it onto real SimpleStatsCache cells rather than core_stats'
	// from_date/to_date window-juggling — an in-progress year's year-grain row
	// already *is* "year to date" by construction). One source table, three
	// of its own rows picked out the same way the real action does — not a
	// cross-source merge, so this stays within the "no compound fixtures"
	// rule.
	{
		const currentYear = new Date().getFullYear();
		const startOfCurrentYear = `${currentYear}-01-01`;
		const startOfLastYear = `${currentYear - 1}-01-01`;
		const [allTimeRows, yearRows] = await Promise.all([
			readRawStatsCacheRows({
				client: alpha,
				groupId: alphaId,
				bySpecies: false,
				select: simpleStatsCacheHomePageSummaryQuery.select,
				temporalUnit: 'all-time'
			}),
			readRawStatsCacheRows({
				client: alpha,
				groupId: alphaId,
				bySpecies: false,
				select: simpleStatsCacheHomePageSummaryQuery.select,
				temporalUnit: 'year'
			})
		]);
		await writeSnapshot(
			`tables/SimpleStatsCache/alpha.home-page-summary.json`,
			{
				allTime: allTimeRows[0] ?? null,
				thisYear:
					yearRows.find((row) => row.time_period === startOfCurrentYear) ??
					null,
				lastYear:
					yearRows.find((row) => row.time_period === startOfLastYear) ?? null
			}
		);
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

		// RPC: demographics_stats (species-filtered, group_by_time_period: month) —
		// powers getSpeciesDemographicsStats (app/actions/sp-data.ts), which backs
		// the species page's Demographics tab. Renamed from population_stats in
		// #878; only ever called species-filtered and time-grouped.
		const { data: robinDemographics } = await alpha.rpc('demographics_stats', {
			species_name_filter: 'Robin',
			ringing_group_filter: alphaId,
			group_by_time_period: 'month' satisfies StatsTemporalUnit
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
		// stats: Robin's own `SimpleStatsCacheBySpecies` row at the all-time
		// grain, the page's actual current read path (#1222,
		// `fetchSpeciesStatsCacheRows` in app/actions/sp-data.ts). Raw embed
		// intact, same as the by-species block above. The wing/weight half's
		// source is `stats_cache_biometrics_metrics/robin-alpha.headline.json`
		// below (#1272) — nothing reads it yet, since rewiring the app-test
		// helper (`app/__tests__/helpers/biometrics-stats-fixtures.ts`) to
		// consume it is a separate, dependent ticket. The page's other
		// inputs need no fixture here: its page of Birds is already
		// tables/Birds/robin-alpha.page-of-birds.json, speciesId/speciesName are
		// route-resolved props, not RPC output, and fetchGraphableEncounterData's
		// chart data (`Birds` + embedded `Encounters`) has no consumer that reads
		// it from a fixture — the one test exercising it mocks the action
		// directly with a small inline array, so a generated fixture here would
		// just be dead weight (#894).
		const robinStats = await readRawStatsCacheRows({
			client: alpha,
			groupId: alphaId,
			bySpecies: true,
			select: simpleStatsCacheBySpeciesHeadlineQuery.select,
			speciesName: 'Robin',
			temporalUnit: 'all-time'
		});
		await writeSnapshot(
			`tables/SimpleStatsCacheBySpecies/robin-alpha.headline.json`,
			robinStats
		);

		// RPC: stats_cache_biometrics_metrics (species-filtered, ungrouped) —
		// the wing/weight sibling of the headline stats above (#1272); see
		// that comment for why nothing reads it yet.
		const { data: robinBiometrics } = await alpha.rpc(
			'stats_cache_biometrics_metrics',
			{
				species_name_filter: 'Robin',
				ringing_group_filter: alphaId
			}
		);
		await writeSnapshot(
			`stats_cache_biometrics_metrics/robin-alpha.headline.json`,
			robinBiometrics ?? []
		);
	}

	// Table: Birds — the fetchBirdPageContent (app/(routes)/bird/[ring]/page.tsx)
	// bird-detail query, split by #901 from the compound
	// tables/Birds/arretrap.bird-detail.json fixture into its two raw sources.
	// Filed under tables/Birds/ since Birds (by ring_no) is the entity the page
	// is keyed on; Encounters is a secondary query merged into the same object.
	// The Birds portion's query is queries/Birds/bird-detail.ts; the Encounters
	// portion is queries/Encounters/arretrap-encounters.ts, kept as a separate
	// query definition rather than reusing the page's own Encounters select,
	// since it's deliberately narrower — see that query file's comment for why.
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
			.select(arretrapEncountersQuery.select)
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
