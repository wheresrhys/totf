#!/usr/bin/env tsx
/**
 * Generate snapshot JSON fixtures from the local e2e seed data.
 *
 * Reads Alpha/Beta/Gamma group data and writes 19 JSON files to
 * test-fixtures/snapshots/ used as mock return values in unit tests.
 *
 * Run via: npm run db:generate-snapshots
 * Or called programmatically: generateSnapshots(alphaId, betaId, gammaId)
 */

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs/promises';
import { supabase } from '../lib/supabase';
import { getAuthenticatedSupabaseClientForGroup } from '../lib/group-auth';

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

async function writeSnapshot(filename: string, data: unknown) {
	await fs.writeFile(
		path.join(SNAPSHOTS_DIR, filename),
		JSON.stringify(data, null, 2)
	);
	console.log(`  → ${filename}`);
}

export async function generateSnapshots(
	alphaId: number,
	betaId: number,
	gammaId: number
) {
	console.log('\nGenerating snapshots...');
	await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });

	const alpha = await getAuthenticatedSupabaseClientForGroup(alphaId);
	const beta = await getAuthenticatedSupabaseClientForGroup(betaId);
	const gamma = await getAuthenticatedSupabaseClientForGroup(gammaId);

	// fetchSpeciesData (spp-data.ts) — aggregate_stats group_by_species
	for (const [name, client, gId] of [
		['alpha', alpha, alphaId],
		['beta', beta, betaId],
		['gamma', gamma, gammaId]
	] as const) {
		const { data } = await client.rpc('aggregate_stats', {
			ringing_group_filter: gId,
			group_by_species: true
		});
		await writeSnapshot(`fetchSpeciesData.${name}.json`, data ?? []);
	}

	// fetchPayOffStats (pay-off-stats.ts) — yearly + monthly aggregate_stats
	for (const [name, client, gId] of [
		['alpha', alpha, alphaId],
		['beta', beta, betaId]
	] as const) {
		const [{ data: yearly }, { data: monthly }] = await Promise.all([
			client.rpc('aggregate_stats', {
				ringing_group_filter: gId,
				group_by_species: false,
				group_by_time_period: 'year'
			}),
			client.rpc('aggregate_stats', {
				ringing_group_filter: gId,
				group_by_species: false,
				group_by_time_period: 'month'
			})
		]);
		await writeSnapshot(`fetchPayOffStats.${name}.json`, {
			yearly: yearly ?? [],
			monthly: monthly ?? []
		});
	}

	// fetchAllSessions (sessions page)
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
		await writeSnapshot(`fetchAllSessions.${name}.json`, data ?? []);
	}

	// fetchMistakes (mistakes page)
	for (const [name, client, gId] of [
		['alpha', alpha, alphaId],
		['beta', beta, betaId]
	] as const) {
		const { data } = await client.rpc('find_discrepencies', {
			ringing_group_filter: gId
		});
		await writeSnapshot(`fetchMistakes.${name}.json`, data ?? []);
	}

	// fetchNotableRetraps (retraps page)
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
		await writeSnapshot(`fetchNotableRetraps.${name}.json`, data ?? []);
	}

	// fetchRecentSessions (home page helper)
	const { data: recentSessions } = await alpha
		.from('Sessions')
		.select(
			'id, visit_date, location_id, ringing_group_id, location:Locations(location_name), encounters:Encounters(count)'
		)
		.eq('ringing_group_id', alphaId)
		.order('visit_date', { ascending: false })
		.limit(3);
	await writeSnapshot(`fetchRecentSessions.alpha.json`, recentSessions ?? []);

	// Robin species ID (needed for species-specific snapshots)
	const { data: robinSpecies } = await alpha
		.from('Species')
		.select('id')
		.eq('species_name', 'Robin')
		.single();

	if (robinSpecies) {
		const BATCH_SIZE = 20;

		// fetchPageOfBirds (sp-data.ts) — Robin page 0 for Alpha
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
		await writeSnapshot(`fetchPageOfBirds.alpha.robin.json`, birdsPage0 ?? []);

		// getSpeciesStatsHistory (sp-data.ts) — Robin monthly for Alpha
		const { data: robinHistory } = await alpha.rpc('aggregate_stats', {
			species_name_filter: 'Robin',
			ringing_group_filter: alphaId,
			group_by_time_period: 'month'
		});
		await writeSnapshot(
			`getSpeciesStatsHistory.alpha.robin.json`,
			robinHistory ?? []
		);

		// fetchSpNotableRetraps (sp-data.ts fetchNotableRetraps) — Robin for Alpha
		const { data: robinRetraps } = await alpha.rpc('notable_retraps', {
			ringing_group_filter: alphaId,
			species_filter: 'Robin',
			result_limit: 10,
			min_proven_age: 3,
			min_encounter_count: 6
		});
		await writeSnapshot(
			`fetchSpNotableRetraps.alpha.robin.json`,
			robinRetraps ?? []
		);

		// fetchGraphableEncounterData (sp-data.ts) — Robin for Alpha
		const { data: graphableData } = await alpha
			.from('Birds')
			.select(`encounters:Encounters(age_code,sex,weight,wing_length)`)
			.eq('species_id', robinSpecies.id)
			.contains('ringing_group_ids', [alphaId]);
		await writeSnapshot(
			`fetchGraphableEncounterData.alpha.robin.json`,
			graphableData ?? []
		);

		// fetchSpPageData (species/[speciesName]/page.tsx) — Robin for Alpha
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
			alpha.rpc('aggregate_stats', {
				species_name_filter: 'Robin',
				ringing_group_filter: alphaId
			})
		]);
		if (birdsPage0 && birdsPage0.length > 0) {
			await writeSnapshot(`fetchSpPageData.alpha.robin.json`, {
				topSessions: topSessions ?? [],
				birds: birdsPage0,
				speciesStats: robinStats?.[0] ?? null,
				speciesId: robinSpecies.id,
				speciesName: 'Robin'
			});
		}
	}

	// getTopPeriodsByMetric (top-performers.ts) — busiest sessions for Alpha
	const { data: topDays } = await alpha.rpc('top_metrics_by_period', {
		temporal_unit: 'day',
		metric_name: 'encounters',
		result_limit: 1,
		filters: { ringing_group_filter: alphaId }
	} as Parameters<typeof alpha.rpc<'top_metrics_by_period'>>[1]);
	await writeSnapshot(`getTopPeriodsByMetric.alpha.json`, topDays ?? []);

	// fetchBirdData (bird/[ring]/page.tsx) — ARRETRAP bird
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
		await writeSnapshot(`fetchBirdData.ARRETRAP.json`, {
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
