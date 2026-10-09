import { camelCase, noCase } from 'change-case';
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
	HighlightScope,
	HighlightDataLake,
	ExtendedTemporalUnit,
	HighlightPageLevelPresence,
	HighlightPresenceAtScopes
} from '../types';
import {
	getStatsByTemporalUnit,
	StatsRepository,
	fetchStatsSpines,
	getServerCachedStats,
	StatsResult
} from '@/app/actions/stats-cache';
import { isNumericHighlightValue } from '../types';
import { getRule, ruleTypes } from '../rules';
import {
	dateToYearMonth,
	getHighlightsOfTypeFromStatsRows,
	buildTimeWindowFilter,
	getFilteredStatsCache,
	getSpeciesFilter,
	filterStats,
	getTimePeriodSampler
} from './highlight-utils';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { groupByColumn } from '../../generic-utils';

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

async function getScopedHighlightsOfType({
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
	const baseData = await getServerCachedStats({
		viewedGroup,
		rpcName: rule.rpcName,
		fetchDataBySpecies: Boolean(species) || rule.speciesUsed !== 'none',
		temporalUnit
	});

	const filteredStats = filterStats({
		rule,
		scope: {
			temporalUnit,
			parentTimeWindow: lakeTimeWindow,
			species
		},
		viewedGroup,
		baseData
	});

	const samplesTimeWindowFilter = getTimePeriodSampler(
		timePeriod,
		samplesTimeWindow
	);
	let returnVal;

	if (rule.speciesUsed === 'grouped') {
		const dataPerSpecies = groupByColumn('species_name', filteredStats);
		returnVal = Object.entries(dataPerSpecies).flatMap(([species, data]) =>
			getHighlightsOfTypeFromStatsRows({
				rule,
				stats: data,
				limit,
				timeWindowFilter: samplesTimeWindowFilter
			}).map((value) => ({
				...value,
				scope: {
					temporalUnit,
					species,
					parentTimeWindow: lakeTimeWindow
				},
				descriptor: rule.descriptor
			}))
		);
	} else {
		returnVal = getHighlightsOfTypeFromStatsRows({
			rule,
			stats: filteredStats,
			limit,
			timeWindowFilter: samplesTimeWindowFilter
		}).map((value) => ({
			...value,
			scope: {
				temporalUnit,
				parentTimeWindow: lakeTimeWindow
			},
			descriptor: rule.descriptor
		}));
	}
	console.log('rv', returnVal);
	return returnVal;
}

const DEFAULT_HIGHLIGHT_INIT_CONFIG: HighlightInitConfig = {
	selfRelativeToAllTime: 1,
	childSessionsRelativeToSelf: 1
};

function getPresence(
	rule: HighlightsGenerator,
	temporalUnit: ExtendedTemporalUnit,
	species?: string
): Partial<HighlightPageLevelPresence> {
	if (!rule.presence) return {};
	const rulePresence = species ? rule.presence.species : rule.presence.general;
	const timePeriodAccessorProperty = camelCase(
		temporalUnit
	) as keyof HighlightPresenceAtScopes;
	return rulePresence[timePeriodAccessorProperty];
}

function getTimeWindow(
	timePeriod: string,
	temporalUnit: ExtendedTemporalUnit
): YearMonthRestriction | undefined {
	const { year, month } = dateToYearMonth(timePeriod);

	if (temporalUnit === 'month') {
		return { month, year };
	} else if (temporalUnit === 'year') {
		return { year };
	} else if (temporalUnit === 'all time') {
		return;
	} else if (temporalUnit === 'all time month') {
		return { month };
	}
}

export async function getHighlightsOfTypeAcrossScopes({
	highlightType,
	timePeriod,
	temporalUnit,
	viewedGroup,
	species
}: {
	highlightType: string;
	timePeriod: string;
	temporalUnit: ExtendedTemporalUnit;
	viewedGroup: ViewedGroup;
	species?: string;
}) {
	const rule = getRule(highlightType);
	const presence = getPresence(rule, temporalUnit, species);
	if (!presence) return [];

	const configs = Object.entries(presence)
		.flatMap(([highlightIterator, dataLakeConfig]) => {
			const sampleTemporalUnit = highlightIterator
				.substring(3)
				.toLowerCase() as TemporalUnit;
			const confs = Object.entries(dataLakeConfig).map(([lakeScope, limit]) => {
				if (limit === 0) return;
				const lakeScopeTemporalUnit = noCase(
					lakeScope.replace('relativeTo', '')
				) as ExtendedTemporalUnit;
				const conf = {
					highlightType,
					viewedGroup,
					timePeriod,
					lakeTimeWindow: getTimeWindow(timePeriod, lakeScopeTemporalUnit),
					samplesTimeWindow: getTimeWindow(timePeriod, temporalUnit),
					temporalUnit: sampleTemporalUnit,
					species,
					limit
				};
				return conf;
			});
			return confs;
		})
		.filter((config) => Boolean(config)) as HighlightsOfTypeParams[];

	console.log('configs', configs);
	return (
		await Promise.all(
			configs.map((config) => getScopedHighlightsOfType(config))
		)
	).flatMap((data) => data);
}

// next reimplement getAllRelevantHighlights as getAllHighlights({

export async function getAllHighlightsAcrossScopes(options: {
	timePeriod: string;
	temporalUnit: ExtendedTemporalUnit;
	viewedGroup: ViewedGroup;
	species?: string;
}) {
	const allHighlights = await Promise.all(
		ruleTypes.map((type) =>
			getHighlightsOfTypeAcrossScopes({
				highlightType: type,
				...options
			})
		)
	);
	return allHighlights;
}
