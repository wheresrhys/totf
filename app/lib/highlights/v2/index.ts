import { fetchDailyStats, type RawStats } from '@/app/actions/highlights-data';
import type { CoreStatsResult } from '@/app/models/db';
const DEFAULT_OPTIONS = { limit: 3, threshold: 0 };
export type OneBasedMonth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

type YearMonthRestriction = {
	year: number | undefined;
	month: OneBasedMonth | undefined;
};

export type Highlight = {
	type: string;
	time_period: string;
	value: number;
	name: string;
};
export type HighlightType =
	| 'birds'
	// | 'encounters'
	| 'species'
	| 'newBirds'
	| 'juvs';

type HighlightFinderOptions = {
	limit?: number;
	threshold?: number;
	type: string;
	name: string;
};

type HighlightGeneratorOverrideOptions = {
	limit?: number;
	threshold?: number;
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
		...DEFAULT_OPTIONS,
		...(options || {})
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
	highlightNameMapping: Record<HighlightType, string>,
	optionOverrides?: HighlightGeneratorOverrideOptions
) {
	return {
		overall: {
			birds: {
				name: highlightNameMapping.birds,
				type: 'birds',
				highlights: getTopByProperty<CoreStatsResult>(
					'bird_count',
					stats.overall,
					{
						type: 'birds',
						name: highlightNameMapping.birds,
						...optionOverrides
					}
				)
			},
			// encounters: {
			// 	name: highlightNameMapping.encounters,
			// 	type: 'encounters',
			// 	highlights: getTopByProperty<CoreStatsResult>(
			// 		'encounter_count',
			// 		stats.overall,
			// 		{ type: 'encounters', name: highlightNameMapping.encounters, ...optionOverrides }
			// 	)
			// },
			species: {
				name: highlightNameMapping.species,
				type: 'species',
				highlights: getTopByProperty<CoreStatsResult>(
					'species_count',
					stats.overall,
					{
						type: 'species',
						name: highlightNameMapping.species,
						...optionOverrides
					}
				)
			},
			newBirds: {
				name: highlightNameMapping.newBirds,
				type: 'newBirds',
				highlights: getTopByProperty<CoreStatsResult>(
					'new_bird_count',
					stats.overall,
					{
						type: 'newBirds',
						name: highlightNameMapping.newBirds,
						...optionOverrides
					}
				)
			},
			juvs: {
				name: highlightNameMapping.juvs,
				type: 'juvs',
				highlights: getTopByPropertiesSum<CoreStatsResult>(
					['pullus_bird_count', 'juv_bird_count', 'postjuv_bird_count'],
					stats.overall,
					{ type: 'juvs', name: highlightNameMapping.juvs, ...optionOverrides }
				)
			}
		}
		// bySpecies: {
		//   // todo - upstream turn bySpecies into a better data structure to work with
		//   counts: counts(dailyStats.bySpecies)
		// }
	};
}

export async function dailyHighlights(
	groupId: number,
	periodFilter?: YearMonthRestriction
) {
	let dailyStats = await fetchDailyStats(groupId);
	if (periodFilter) {
		const { month, year } = periodFilter;
		let filter: (timePeriod: string) => boolean;
		if (year && month) {
			filter = (timePeriod) =>
				timePeriod.startsWith(`${year}-${String(month).padStart(2, '0')}-`);
		} else if (year) {
			filter = (timePeriod) => timePeriod.startsWith(`${year}-`);
		} else if (month) {
			filter = (timePeriod) =>
				timePeriod.includes(`-${String(month).padStart(2, '0')}-`);
		} else {
			filter = () => true;
		}
		dailyStats = {
			overall: dailyStats.overall.filter(({ time_period }) =>
				filter(time_period)
			),
			bySpecies: dailyStats.bySpecies.filter(({ time_period }) =>
				filter(time_period)
			)
		};
	}
	const limit = Math.min(
		DEFAULT_OPTIONS.limit,
		Math.ceil(dailyStats.overall.length / 4)
	);
	return generateHighlights(
		dailyStats,
		{
			birds: limit > 1 ? 'Busiest sessions' : 'Busiest session',
			// encounters: limit > 1 ? 'Busiest sessions' : 'Busiest session',
			species: limit > 1 ? 'Most varied sessions' : 'Most varied session',
			newBirds:
				limit > 1
					? 'Sessions with most new birds'
					: 'Session with most new birds',
			juvs: limit > 1 ? 'Sessions with most juvs' : 'Session with most juvs'
		},
		{
			limit
		}
	);
}
