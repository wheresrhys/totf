import type {
	NewHighlightValue,
	HighlightsOfTypeParams
} from '../../types';
import { getRule } from '../rule-registry';
import {
	getHighlightsOfTypeFromStatsRows,
	filterStats,
	getTimePeriodSampler
} from '../highlight-utils';
// Must stay `@/modules/stats/browser`, never the bare `@/modules/stats`
// barrel: this very module once broke the dev build by importing the full
// barrel, dragging `@opentelemetry/api` into the client bundle (see
// `modules/stats/CLAUDE.md`). Every file here that touches stats keeps
// importing `/browser`.
import { globalStatsCacheFetchPool, type StatsResult } from '@/modules/stats/browser';
import { groupByColumn } from '@/app/lib/generic-utils';

export async function getScopedHighlightsOfType({
	highlightType,
	viewedGroup,
	timePeriod,
	lakeTimeWindow,
	samplesTimeWindow,
	temporalUnit,
	species,
	limit
}: HighlightsOfTypeParams): Promise<NewHighlightValue[]> {
	const rule = getRule(highlightType);
	// `pooledStatsCacheFetch`/`readStatsCacheRows` return plain
	// `Record<string, unknown>[]` rows (#1236) — narrowed here to the shape
	// every Highlights rule already expects, same as every other
	// `readStatsCacheRows`-family caller narrows its own result.
	const baseData = (await globalStatsCacheFetchPool.fetch({
		viewedGroup,
		bySpecies: Boolean(species) || rule.speciesUsed !== 'none',
		temporalUnit
	})) as StatsResult[];

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

	if (rule.speciesUsed === 'grouped') {
		const dataPerSpecies = groupByColumn('species_name', filteredStats);
		return Object.entries(dataPerSpecies).flatMap(([species, data]) => {
			const scope = {
				temporalUnit,
				species,
				parentTimeWindow: lakeTimeWindow
			};
			return getHighlightsOfTypeFromStatsRows({
				rule,
				stats: data,
				limit,
				timeWindowFilter: samplesTimeWindowFilter,
				scope
			}).map((value) => ({
				...value,
				scope,
				descriptor: rule.descriptor
			})) as NewHighlightValue[];
		});
	} else {
		const scope = {
			temporalUnit,
			parentTimeWindow: lakeTimeWindow
		};
		return getHighlightsOfTypeFromStatsRows({
			rule,
			stats: filteredStats,
			limit,
			timeWindowFilter: samplesTimeWindowFilter,
			scope
		}).map((value) => ({
			...value,
			scope,
			descriptor: rule.descriptor
		})) as NewHighlightValue[];
	}
}
