import {
	getStatsByTemporalUnit,
	type RawStats
} from '@/app/actions/highlights-data';
import type { CoreStatsResult } from '@/app/models/db';
import { DEFAULT_OPTIONS, highlightRules } from './highlight-rules';
export type OneBasedMonth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type YearMonthRestriction = {
	year?: number;
	month?: OneBasedMonth;
};
export type HighlightUnit = 'bird' | 'species' | 'encounter';
export type HighlightTemporalUnit = 'day' | 'month' | 'year';
type HighlightCategory = 'count' | 'rarity' | 'biometrics';
type HighlightType = 'birds' | 'encounters' | 'species' | 'newBirds' | 'juvs';

export type Highlight = {
	time_period: string;
	value: number;
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
	position: number;
	isTied: boolean;
};

function applyLimitToHighlight(
	highlightWrapper: HighlightsOfType,
	limit: number
): HighlightsOfType {
	if (highlightWrapper.highlights.length < limit) {
		return {
			...highlightWrapper
		};
	}
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

function isHighlightsOfType(item: unknown): item is HighlightsOfType {
	return Boolean(item);
}

function generateHighlightsFromStats({
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
		unboundedHighlights = highlightRules
			.map((rule) => {
				if (rule.condition && !rule.condition(temporalUnit)) return null;
				const highlights: HighlightsOfType = {
					...rule,
					temporalUnit,
					highlights: rule.generator(stats.overall)
				};
				return highlights;
			})
			.filter(isHighlightsOfType);

		cache.set(cacheKey, unboundedHighlights);
	}
	return applyLimitToHighlights(
		unboundedHighlights,
		limit || DEFAULT_OPTIONS.limit
	);
}

async function getHighlightsByTemporalUnit({
	temporalUnit,
	groupId,
	limit,
	periodFilter
}: {
	temporalUnit: HighlightTemporalUnit;
	groupId: number;
	limit?: number;
	periodFilter?: YearMonthRestriction;
}) {
	let dailyStats = await getStatsByTemporalUnit(temporalUnit, groupId);
	let cacheKey = `${groupId}-${temporalUnit}`;
	if (periodFilter) {
		const { month, year } = periodFilter;
		let filter: (timePeriod: string) => boolean;
		if (year && month) {
			cacheKey = `${cacheKey}-${year}-${month}`;
			filter = (timePeriod) =>
				timePeriod.startsWith(`${year}-${String(month).padStart(2, '0')}-`);
		} else if (year) {
			cacheKey = `${cacheKey}-${year}`;
			filter = (timePeriod) => timePeriod.startsWith(`${year}-`);
		} else if (month) {
			cacheKey = `${cacheKey}-${month}`;
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
	return generateHighlightsFromStats({
		cacheKey,
		temporalUnit,
		stats: dailyStats,
		limit
	});
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
	return getHighlightsByTemporalUnit({
		temporalUnit: 'day',
		groupId,
		limit,
		periodFilter
	});
}

export async function monthlyHighlights({
	groupId,
	limit,
	periodFilter
}: {
	groupId: number;
	limit?: number;
	periodFilter?: YearMonthRestriction;
}) {
	return getHighlightsByTemporalUnit({
		temporalUnit: 'month',
		groupId,
		limit,
		periodFilter
	});
}

function calculatePosition(
	siblingHighlights: Highlight[],
	highlightIndex: number
) {
	const activeHighlight = siblingHighlights[highlightIndex];
	const activeValue = activeHighlight.value;
	const allValues = [
		...new Set(siblingHighlights.map(({ value }) => value))
	].sort((a, b) => b - a);
	const position = allValues.indexOf(activeValue) + 1;
	const isTied =
		siblingHighlights.filter(({ value }) => value === activeValue).length > 1;

	return { position, isTied };
}

function filterOutIrrelevantHighlights(
	highlights: HighlightsOfType[],
	timePeriod: string,
	parentTimeWindow?: YearMonthRestriction
) {
	const relevantHighlights: HighlightInContext[] = [];

	highlights.forEach((highlightWrapper) => {
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
				parentTimeWindow,
				value: relevantHighlight.value,
				timePeriod: relevantHighlight.time_period,
				...calculatePosition(
					highlightWrapper.highlights,
					relevantHighlightIndex
				)
			});
		}
	});
	return relevantHighlights;
}

export async function fetchDayHighlights(
	groupId: number,
	timePeriod: string
): Promise<HighlightInContext[]> {
	const yearPeriodFilter = { year: Number(timePeriod.split('-')[0]) };
	const monthPeriodFilter = {
		month: Number(timePeriod.split('-')[1]) as OneBasedMonth
	};
	const allTimeDailyHighlights = await dailyHighlights({
		groupId,
		limit: 3
	});
	const yearDailyHighlights = await dailyHighlights({
		groupId,
		periodFilter: yearPeriodFilter,
		limit: 3
	});
	const monthDailyHighlights = await dailyHighlights({
		groupId,
		periodFilter: monthPeriodFilter,
		limit: 3
	});
	const allRelevantHighlights = [
		...filterOutIrrelevantHighlights(allTimeDailyHighlights, timePeriod),
		...filterOutIrrelevantHighlights(
			yearDailyHighlights,
			timePeriod,
			yearPeriodFilter
		),
		...filterOutIrrelevantHighlights(
			monthDailyHighlights,
			timePeriod,
			monthPeriodFilter
		)
	];
	const filteredHighlights = allRelevantHighlights.filter((highlight) => {
		if (highlight.parentTimeWindow) {
			const isClobbered = allRelevantHighlights.some(
				(potentialClobber) =>
					potentialClobber.type === highlight.type &&
					potentialClobber.category === highlight.category &&
					!potentialClobber.parentTimeWindow &&
					!(highlight.position < potentialClobber.position) &&
					!(
						highlight.position === potentialClobber.position &&
						potentialClobber.isTied &&
						!highlight.isTied
					)
			);
			return !isClobbered;
		} else {
			return true;
		}
	});
	return filteredHighlights.toSorted((a, b) => {
		if (a.category + a.type === b.category + b.type) return 0;
		return a.category + a.type > b.category + b.type ? 1 : -1;
	});
}
