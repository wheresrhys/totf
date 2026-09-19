import { fetchDailyStats, type RawStats } from '@/app/actions/highlights-data';
import type { CoreStatsResult } from '@/app/models/db';
const DEFAULT_OPTIONS = { limit: 3, threshold: 0 };

export type Highlight = {
	type: string;
	time_period: string;
	value: number;
	name: string;
};
export type HighlightType =
	| 'birds'
	| 'encounters'
	| 'species'
	| 'newBirds'
	| 'juvs';

type HighlightFinderOptions = {
	limit?: number;
	threshold?: number;
	type: string;
	name: string;
};

function sumProperties<T>(item: T, properties: (keyof T)[]) {
	return properties.reduce(
		(sum, property) => sum + ((item[property] as number) ?? 0),
		0
	);
}

interface TimePeriodedItem {
	time_period: string | null;
}

function getTopByPropertiesSum<T extends TimePeriodedItem>(
	properties: (keyof T)[],
	rawStats: T[],
	options: HighlightFinderOptions
): Highlight[] {
	const { threshold, limit, type, name } = {
		...(options || {}),
		...DEFAULT_OPTIONS
	};
	const orderedStats = rawStats
		.map((item) => ({
			time_period: item.time_period as string,
			value: sumProperties(item, properties),
			type,
			name
		}))
		.filter((item) => item.value > threshold)
		.sort((a, b) => b.value - a.value);

	const boundaryValue = orderedStats[limit - 1].value;
	const itemsIncludingTies =
		orderedStats.findLastIndex(({ value }) => value === boundaryValue) + 1;
	return orderedStats.slice(0, itemsIncludingTies);
}

function getTopByProperty<T extends TimePeriodedItem>(
	property: keyof T,
	rawStats: T[],
	options: HighlightFinderOptions
): Highlight[] {
	return getTopByPropertiesSum([property], rawStats, options);
}

function generateHighlights(
	stats: RawStats,
	highlightNameMapping: Record<HighlightType, string>
) {
	return {
		overall: {
			birds: {
				name: highlightNameMapping.birds,
				type: 'birds',
				highlights: getTopByProperty<CoreStatsResult>(
					'bird_count',
					stats.overall,
					{ type: 'birds', name: highlightNameMapping.birds }
				)
			},
			encounters: {
				name: highlightNameMapping.encounters,
				type: 'encounters',
				highlights: getTopByProperty<CoreStatsResult>(
					'encounter_count',
					stats.overall,
					{ type: 'encounters', name: highlightNameMapping.encounters }
				)
			},
			species: {
				name: highlightNameMapping.species,
				type: 'species',
				highlights: getTopByProperty<CoreStatsResult>(
					'species_count',
					stats.overall,
					{ type: 'species', name: highlightNameMapping.species }
				)
			},
			newBirds: {
				name: highlightNameMapping.newBirds,
				type: 'newBirds',
				highlights: getTopByProperty<CoreStatsResult>(
					'new_bird_count',
					stats.overall,
					{ type: 'newBirds', name: highlightNameMapping.newBirds }
				)
			},
			juvs: {
				name: highlightNameMapping.juvs,
				type: 'juvs',
				highlights: getTopByPropertiesSum<CoreStatsResult>(
					['pullus_bird_count', 'juv_bird_count', 'postjuv_bird_count'],
					stats.overall,
					{ type: 'juvs', name: highlightNameMapping.juvs }
				)
			}
		}
		// bySpecies: {
		//   // todo - upstream turn bySpecies into a better data structure to work with
		//   counts: counts(dailyStats.bySpecies)
		// }
	};
}

export async function dailyHighlights(groupId: number) {
	const dailyStats = await fetchDailyStats(groupId);
	return generateHighlights(dailyStats, {
		birds: 'Busiest sessions',
		encounters: 'Busiest sessions',
		species: 'Most varied sessions',
		newBirds: 'Sessions with most new birds',
		juvs: 'Session with most juvs'
	});
}
