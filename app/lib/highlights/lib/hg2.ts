import type {
	HighlightsOfType,
	CherryPickedHighlight,
	YearMonthRestriction,
	HighlightDescriptor,
	HighlightValue,
	CombinedHighlight,
	HighlightCategory,
	NumericHighlightValue,
	HighlightsGenerator,
	HighlightInitConfig,
	HighlightScope
} from '../types';
import {
	getStatsByTemporalUnit,
	StatsRepository,
	fetchStatsSpines,
	getCachedStats
} from '@/app/actions/stats-cache';
import { isNumericHighlightValue } from '../types';
import { getRule } from '../rules';
import {
	getHighlightsWithinTimeWindow,
	buildTimeWindowFilter
} from './highlight-generator';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { groupByColumn } from '../../generic-utils';
const highlightCategoryOrder: HighlightCategory[] = [
	'rarity',
	'count',
	'biometrics'
];

function dateToYearMonth(date: string): YearMonthRestriction {
	const [year, month] = date.split('-');
	return { year: Number(year), month: Number(month) };
}

const temporalUnitHierachy = ['year', 'month', 'day'];

type BaseHighlightsOfTypeParams = {
	highlightType: string;
	timePeriod: string;
	temporalUnit: TemporalUnit;
	viewedGroup: ViewedGroup;
	species?: string;
};

type HighlightsOfTypeParams = BaseHighlightsOfTypeParams & {
	lakeTimeWindow?: YearMonthRestriction;
	samplesTimeWindow?: YearMonthRestriction;
	limit: number;
};

type AllHighlightsOfTypeParams = BaseHighlightsOfTypeParams & {
	highlightInit: HighlightInitConfig;
};

function applyLimitToHighlights(
	highlights: NewHighlight[],
	limit: number
): NewHighlight[] {
	if (highlights.length < limit) {
		return highlights;
	}
	const boundaryValue = highlights[limit - 1].value;
	const itemsIncludingTies =
		highlights.findLastIndex(({ value }) => value === boundaryValue) + 1;
	return highlights.slice(0, itemsIncludingTies);
}

type NewHighlight = HighlightValue & {
	scope: HighlightScope;
	descriptor: HighlightDescriptor;
};
function getHighlightsOfTypeFromDataSet({
	rule,
	data,
	scope,
	samplesTimeWindowFilter,
	limit
}: {
	rule: HighlightsGenerator;
	data: unknown[];
	scope: HighlightScope;
	limit: number;
	samplesTimeWindowFilter: (timePeriod: string) => boolean;
}): NewHighlight[] {
	const highlights = (rule.generator as (stats: unknown[]) => HighlightValue[])(
		data
	).map((value) => ({
		...value,
		scope,
		descriptor: rule.descriptor
	}));
	const limitedHighlights = applyLimitToHighlights(highlights, limit);

	return limitedHighlights.filter(({ timePeriod }) =>
		samplesTimeWindowFilter(timePeriod)
	);
}

async function getHighlightsOfType({
	highlightType,
	viewedGroup,
	timePeriod,
	lakeTimeWindow,
	samplesTimeWindow,
	temporalUnit,
	species,
	limit
}: HighlightsOfTypeParams) {
	const rule = getRule(highlightType);
	const baseData = await getCachedStats({
		viewedGroup,
		rpcName: rule.rpcName,
		fetchDataBySpecies: Boolean(species) || rule.speciesPresence !== 'none',
		temporalUnit
	});
	const lakeTimeWindowFilter = buildTimeWindowFilter(lakeTimeWindow);
	const samplesTimeWindowFilter = samplesTimeWindow
		? buildTimeWindowFilter(samplesTimeWindow)
		: (highlightTimePeriod: string) => highlightTimePeriod === timePeriod;
	const timeScopedData = baseData.filter(({ time_period }) =>
		lakeTimeWindowFilter(time_period as string)
	);
	let results;
	if (rule.speciesPresence === 'grouped') {
		const dataPerSpecies = groupByColumn('species_name', timeScopedData);
		return Object.entries(dataPerSpecies).flatMap(([species, data]) =>
			getHighlightsOfTypeFromDataSet({
				rule,
				data,
				limit,
				samplesTimeWindowFilter,
				scope: {
					temporalUnit,
					species,
					parentTimeWindow: lakeTimeWindow
				}
			})
		);
	} else {
		return getHighlightsOfTypeFromDataSet({
			rule,
			data: timeScopedData,
			limit,
			samplesTimeWindowFilter,
			scope: {
				temporalUnit,
				parentTimeWindow: lakeTimeWindow
			}
		});
	}
}

async function getAllRelevantHighlightsOfType(
	options: AllHighlightsOfTypeParams
) {
	const { year, month } = dateToYearMonth(options.timePeriod);
	let selfTimeWindow: YearMonthRestriction;

	if (options.temporalUnit === 'month') {
		selfTimeWindow = { month, year };
	}

	if (options.temporalUnit === 'month') {
		selfTimeWindow = { year };
	}
	const fetchers = Object.entries(options.highlightInit).map(
		([highlighScoping, limit]) => {
			switch (highlighScoping) {
				case 'self':
					break;
				case 'selfRelativeToParentMonth':
					return getHighlightsOfType({
						...options,
						lakeTimeWindow: { year, month },
						limit
					});
				case 'selfRelativeToParentYear':
					return getHighlightsOfType({
						...options,
						lakeTimeWindow: { year },
						limit
					});
				case 'selfRelativeToAllTimeMonth':
					return getHighlightsOfType({
						...options,
						lakeTimeWindow: { month },
						limit
					});
				case 'selfRelativeToAllTime':
					return getHighlightsOfType({
						...options,
						limit
					});
				case 'childSessionsRelativeToSelf':
					return getHighlightsOfType({
						...options,
						samplesTimeWindow: selfTimeWindow,
						lakeTimeWindow: selfTimeWindow,
						temporalUnit: 'day',
						limit
					});
				case 'childSessionsRelativeToParentYear':
					return getHighlightsOfType({
						...options,
						samplesTimeWindow: selfTimeWindow,
						lakeTimeWindow: { year },
						temporalUnit: 'day',
						limit
					});
				case 'childSessionsRelativeToAllTimeMonth':
					return getHighlightsOfType({
						...options,
						samplesTimeWindow: selfTimeWindow,
						lakeTimeWindow: { month },
						temporalUnit: 'day',
						limit
					});
				case 'childSessionsRelativeToAllTime':
					return getHighlightsOfType({
						...options,
						samplesTimeWindow: selfTimeWindow,
						temporalUnit: 'day',
						limit
					});
				case 'childMonthsRelativeToSelf':
					return getHighlightsOfType({
						...options,
						samplesTimeWindow: selfTimeWindow,
						lakeTimeWindow: selfTimeWindow,
						temporalUnit: 'month',
						limit
					});
				case 'childMonthsRelativeToParentYear':
					return getHighlightsOfType({
						...options,
						samplesTimeWindow: selfTimeWindow,
						lakeTimeWindow: { year },
						temporalUnit: 'month',
						limit
					});
					break;
				case 'childMonthsRelativeToAllTime':
					return getHighlightsOfType({
						...options,
						samplesTimeWindow: selfTimeWindow,
						temporalUnit: 'month',
						limit
					});
					break;
				default:
					return [];
			}
		}
	);
	return (await Promise.all(fetchers)).flatMap((data) => data);
}
