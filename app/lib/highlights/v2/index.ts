import { fetchDailyStats, type RawStats } from '@/app/actions/highlights-data';
import type { CoreStatsResult } from '@/app/models/db';
const DEFAULT_OPTIONS = { limit: 3, threshold: 0 };
export type OneBasedMonth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type YearMonthRestriction = {
	year?: number;
	month?: OneBasedMonth;
};
export type HighlightUnit = 'bird' | 'species' | 'encounter';
export type HighlightTemporalUnit = 'session' | 'month';
type HighlightCategory = 'count' | 'rarity' | 'biometrics';
type HighlightType =
	| 'birds'
	// | 'encounters'
	| 'species'
	| 'newBirds'
	| 'juvs';

export type Highlight = {
	time_period: string;
	value: number;
};

interface TimePeriodedItem {
	time_period: string | null;
}

type HighlightFinderOptions = {
	threshold?: number;
};

export type HighlightsOfType = {
	type: HighlightType;
	verb: string;
	temporalUnit: HighlightTemporalUnit;
	unit: HighlightUnit;
	category: HighlightCategory;
	highlights: Highlight[];
};

export type HighlightInContext = {
	type: HighlightType;
	parentTimeWindow?: YearMonthRestriction;
	verb: string;
	temporalUnit: HighlightTemporalUnit;
	unit: HighlightUnit;
	category: HighlightCategory;
	highlightIndex: number;
	siblingHighlights: Highlight[];
	value: number;
	timePeriod: string;
};

function sumProperties<T>(item: T, properties: (keyof T)[]) {
	return properties.reduce(
		(sum, property) => sum + ((item[property] as number) ?? 0),
		0
	);
}

function getTopByPropertiesSum<T extends TimePeriodedItem>(
	properties: (keyof T)[],
	rawStats: T[],
	options?: HighlightFinderOptions
): Highlight[] {
	const { threshold } = {
		...DEFAULT_OPTIONS,
		...(options || {})
	};
	return rawStats
		.map((item) => ({
			time_period: item.time_period as string,
			value: sumProperties(item, properties)
		}))
		.filter((item) => item.value > threshold)
		.sort((a, b) => b.value - a.value);
}

function getTopByProperty<T extends TimePeriodedItem>(
	property: keyof T,
	rawStats: T[],
	options?: HighlightFinderOptions
): Highlight[] {
	return getTopByPropertiesSum([property], rawStats, options);
}

function applyLimitToHighlight(
	highlightWrapper: HighlightsOfType,
	limit: number
): HighlightsOfType {
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

function applyLimitToHighlights(highlights: HighlightsOfType[], limit: number) {
	return highlights.map((highlightWrapper) =>
		applyLimitToHighlight(highlightWrapper, limit)
	);
}

//TODO do something to clear cache when logging out

const cache: Map<string, HighlightsOfType[]> = new Map();

function generateHighlights({
	stats,
	limit,
	temporalUnit,
	cacheKey
}: {
	stats: RawStats;
	temporalUnit: HighlightTemporalUnit;
	limit?: number;
	cacheKey: string;
}): HighlightsOfType[] {
	let unboundedHighlights: HighlightsOfType[];
	if (cache.has(cacheKey)) {
		unboundedHighlights = cache.get(cacheKey) as HighlightsOfType[];
	} else {
		unboundedHighlights = [
			{
				type: 'birds',
				unit: 'bird',
				verb: 'Busiest',
				temporalUnit,
				category: 'count',
				highlights: getTopByProperty<CoreStatsResult>(
					'bird_count',
					stats.overall
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
			{
				type: 'species',
				unit: 'species',
				verb: 'Most varied',
				temporalUnit,
				category: 'count',
				highlights: getTopByProperty<CoreStatsResult>(
					'species_count',
					stats.overall
				)
			},
			{
				type: 'newBirds',
				category: 'count',
				unit: 'bird',
				verb: 'Most new birds in a',
				temporalUnit,
				highlights: getTopByProperty<CoreStatsResult>(
					'new_bird_count',
					stats.overall
				)
			},
			{
				type: 'juvs',
				category: 'count',
				unit: 'bird',
				verb: 'Most juveniles in a',
				temporalUnit,
				highlights: getTopByPropertiesSum<CoreStatsResult>(
					['pullus_bird_count', 'juv_bird_count', 'postjuv_bird_count'],
					stats.overall
				)
			}
			// bySpecies: {
			//   // todo - upstream turn bySpecies into a better data structure to work with
			//   counts: counts(dailyStats.bySpecies)
			// }
		];
		cache.set(cacheKey, unboundedHighlights);
	}
	return applyLimitToHighlights(
		unboundedHighlights,
		limit || DEFAULT_OPTIONS.limit
	);
}

export async function dailyHighlights({
	groupId,
	limit,
	periodFilter
}: {
	groupId: number;
	limit?: number;
	periodFilter?: YearMonthRestriction;
}) {
	let dailyStats = await fetchDailyStats(groupId);
	let cacheKey = `${groupId}-daily`;
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
	if (!limit) {
		limit = Math.min(
			DEFAULT_OPTIONS.limit,
			Math.ceil(dailyStats.overall.length / 4)
		);
	}
	return generateHighlights({
		cacheKey,
		temporalUnit: 'session',
		stats: dailyStats,
		limit
	});
}

export async function fetchDayHighlights(
	groupId: number,
	timePeriod: string,
	periodFilter?: YearMonthRestriction
): Promise<HighlightInContext[]> {
	const allTimeDailyHighlights = await dailyHighlights({
		groupId,
		periodFilter,
		limit: 3
	});
	const relevantHighlights: HighlightInContext[] = [];

	allTimeDailyHighlights.forEach((highlightWrapper) => {
		const relevantHighlightIndex = highlightWrapper.highlights.findIndex(
			({ time_period }) => timePeriod === time_period
		);
		const relevantHighlight =
			highlightWrapper.highlights[relevantHighlightIndex];

		if (relevantHighlightIndex > -1) {
			relevantHighlights.push({
				...highlightWrapper,
				siblingHighlights: highlightWrapper.highlights,
				highlightIndex: relevantHighlightIndex,
				value: relevantHighlight.value,
				timePeriod: relevantHighlight.time_period
			});
		}
	});
	return relevantHighlights;
}
