import {
	getStatsByTemporalUnit,
	type RawStats
} from '@/app/actions/highlights-data';
import { DEFAULT_OPTIONS, highlightRules } from './highlight-rules';
import type {
	HighlightsOfType,
	CherryPickedHighlight,
	YearMonthRestriction,
	HighlightValue
} from './types';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
function applyLimitToHighlight(
	highlightWrapper: HighlightsOfType,
	limit: number
): HighlightsOfType {
	if (highlightWrapper.values.length < limit) {
		return {
			...highlightWrapper
		};
	}
	const boundaryValue = highlightWrapper.values[limit - 1].value;
	const itemsIncludingTies =
		highlightWrapper.values.findLastIndex(
			({ value }) => value === boundaryValue
		) + 1;
	return {
		...highlightWrapper,
		values: highlightWrapper.values.slice(0, itemsIncludingTies)
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
	temporalUnit: TemporalUnit;
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
					scope: { temporalUnit },
					values: rule.generator(stats.overall)
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
	temporalUnit: TemporalUnit;
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
	siblingHighlights: HighlightValue[],
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
	const relevantHighlights: CherryPickedHighlight[] = [];

	highlights.forEach((highlightWrapper) => {
		const relevantHighlightIndex = highlightWrapper.values.findIndex(
			(value) => value.timePeriod === timePeriod
		);
		const relevantHighlight = highlightWrapper.values[relevantHighlightIndex];

		if (relevantHighlightIndex > -1) {
			relevantHighlights.push({
				...highlightWrapper,
				scope: {
					...highlightWrapper.scope,
					parentTimeWindow
				},
				value: relevantHighlight,
				ranking: {
					...calculatePosition(highlightWrapper.values, relevantHighlightIndex),
					siblingHighlights: highlightWrapper.values,
					highlightIndex: relevantHighlightIndex
				}
			});
		}
	});
	return relevantHighlights;
}

export async function fetchDayHighlights(
	groupId: number,
	timePeriod: string
): Promise<CherryPickedHighlight[]> {
	const yearPeriodFilter = { year: Number(timePeriod.split('-')[0]) };
	const monthPeriodFilter = {
		month: Number(timePeriod.split('-')[1])
	};
	const allTimeDailyHighlights = await dailyHighlights({
		groupId,
		limit: 5
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
		if (highlight.scope.parentTimeWindow) {
			const isClobbered = allRelevantHighlights.some(
				(potentialClobber) =>
					potentialClobber.type === highlight.type &&
					potentialClobber.category === highlight.category &&
					!potentialClobber.scope.parentTimeWindow &&
					!(highlight.ranking.position < potentialClobber.ranking.position) &&
					!(
						highlight.ranking.position === potentialClobber.ranking.position &&
						potentialClobber.ranking.isTied &&
						!highlight.ranking.isTied
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
