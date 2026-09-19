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
	return rawStats
		.map((item) => ({
			time_period: item.time_period as string,
			value: sumProperties(item, properties),
			type,
			name
		}))
		.filter((item) => item.value > threshold)
		.sort((a, b) => b.value - a.value);
}

function applyLimitToHighlight(
	highlightWrapper: HighlightsOfType,
	limit: number
) {
	const boundaryValue = highlightWrapper.highlights[limit - 1].value;
	const itemsIncludingTies =
		highlightWrapper.highlights.findLastIndex(
			({ value }) => value === boundaryValue
		) + 1;
	return {
		...highlightWrapper,
		highlights: highlightWrapper.highlights.slice(0, itemsIncludingTies)
	};
}

function applyLimitToHighlights(
	highlights: Record<HighlightType, HighlightsOfType>,
	limit: number
): Record<HighlightType, HighlightsOfType> {
	return Object.fromEntries(
		Object.entries(highlights).map(([type, highlightWrapper]) => [
			type,
			applyLimitToHighlight(highlightWrapper, limit)
		])
	) as Record<HighlightType, HighlightsOfType>;
}

function getTopByProperty<T extends TimePeriodedItem>(
	property: keyof T,
	rawStats: T[],
	options: HighlightFinderOptions
): Highlight[] {
	return getTopByPropertiesSum([property], rawStats, options);
}

type HighlightsOfType = {
	name: string;
	type: string;
	highlights: Highlight[];
};

type Highlights = {
	overall: Record<HighlightType, HighlightsOfType>;
};

//TODO do something to clear cache when logging out

const cache: Map<string, Highlights> = new Map();

function generateHighlights({
	stats,
	highlightNameMapping,
	limit,
	cacheKey
}: {
	stats: RawStats;
	highlightNameMapping: Record<HighlightType, string>;
	limit?: number;
	cacheKey: string;
}): Highlights {
	let unboundedHighlights: Highlights;
	if (cache.has(cacheKey)) {
		unboundedHighlights = cache.get(cacheKey) as Highlights;
	} else {
		unboundedHighlights = {
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
							limit
						}
					)
				},
				// encounters: {
				// 	name: highlightNameMapping.encounters,
				// 	type: 'encounters',
				// 	highlights: getTopByProperty<CoreStatsResult>(
				// 		'encounter_count',
				// 		stats.overall,
				// 		{ type: 'encounters', name: highlightNameMapping.encounters, limit }
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
							limit
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
							limit
						}
					)
				},
				juvs: {
					name: highlightNameMapping.juvs,
					type: 'juvs',
					highlights: getTopByPropertiesSum<CoreStatsResult>(
						['pullus_bird_count', 'juv_bird_count', 'postjuv_bird_count'],
						stats.overall,
						{ type: 'juvs', name: highlightNameMapping.juvs, limit }
					)
				}
			}
			// bySpecies: {
			//   // todo - upstream turn bySpecies into a better data structure to work with
			//   counts: counts(dailyStats.bySpecies)
			// }
		};
		cache.set(cacheKey, unboundedHighlights);
	}
	return {
		overall: applyLimitToHighlights(
			unboundedHighlights.overall,
			limit || DEFAULT_OPTIONS.limit
		)
	};
}

export async function dailyHighlights(
	groupId: number,
	periodFilter?: YearMonthRestriction
) {
	let dailyStats = await fetchDailyStats(groupId);
	let cacheKey = 'daily';
	if (periodFilter) {
		const { month, year } = periodFilter;
		let filter: (timePeriod: string) => boolean;
		if (year && month) {
			cacheKey = `daily-${year}-${month}`;
			filter = (timePeriod) =>
				timePeriod.startsWith(`${year}-${String(month).padStart(2, '0')}-`);
		} else if (year) {
			cacheKey = `daily-${year}`;
			filter = (timePeriod) => timePeriod.startsWith(`${year}-`);
		} else if (month) {
			cacheKey = `daily-${month}`;
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
	return generateHighlights({
		cacheKey,
		stats: dailyStats,
		highlightNameMapping: {
			birds: limit > 1 ? 'Busiest sessions' : 'Busiest session',
			// encounters: limit > 1 ? 'Busiest sessions' : 'Busiest session',
			species: limit > 1 ? 'Most varied sessions' : 'Most varied session',
			newBirds:
				limit > 1
					? 'Sessions with most new birds'
					: 'Session with most new birds',
			juvs: limit > 1 ? 'Sessions with most juvs' : 'Session with most juvs'
		},
		limit
	});
}
