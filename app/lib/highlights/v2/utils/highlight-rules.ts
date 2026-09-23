import type {
	HighlightValue,
	HighlightsGenerator,
	YearMonthRestriction
} from '../types';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
import type { CoreStatsResult } from '@/app/models/db';
import type { StatsRepository } from '@/app/actions/highlights-data';
export const DEFAULT_OPTIONS = { limit: 3, threshold: 0 };

type HighlightFinderOptions = {
	threshold?: number;
};

function sumProperties(
	item: CoreStatsResult,
	properties: (keyof CoreStatsResult)[]
) {
	return properties.reduce(
		(sum, property) => sum + ((item[property] as number) ?? 0),
		0
	);
}

export function getTopByPropertiesSum(
	properties: (keyof CoreStatsResult)[],
	options?: HighlightFinderOptions
): (stats: CoreStatsResult[]) => HighlightValue[] {
	const { threshold } = {
		...DEFAULT_OPTIONS,
		...(options || {})
	};
	return (stats: CoreStatsResult[]) => {
		const potentialHighlights = stats.map((row) => ({
			timePeriod: row.time_period as string,
			value: sumProperties(row, properties),
			species: row.species_name
		}));
		const max = Math.max(...potentialHighlights.map((item) => item.value));
		return potentialHighlights
			.filter((row) => row.value > Math.max(threshold, max / 2))
			.sort((a, b) => b.value - a.value);
	};
}

export function getTopByProperty(
	property: keyof CoreStatsResult,
	options?: HighlightFinderOptions
): (stats: CoreStatsResult[]) => HighlightValue[] {
	return getTopByPropertiesSum([property], options);
}

type CoreStatsRepository = StatsRepository<CoreStatsResult>;

// export const highlightRules: HighlightsGenerator[] = [
// 	{
// 		statsSelector: (stats: CoreStatsRepository) => stats.overall,
// 		highlightListPrefixPrinter: (highlightsOfType) =>
// 		descriptor: {
// 			type: 'birds',
// 			unit: 'bird',
// 			applyVerb: (temporalUnit, species, usePlural) =>
// 				`Busiest ${printTemporalUnit(temporalUnit, usePlural)}`,
// 			category: 'count'
// 		},
// 		generator: getTopByProperty('bird_count')
// 	},
// 	{
// 		statsSelector: (stats: CoreStatsRepository) => stats.overall,
// 		descriptor: {
// 			type: 'encounters',
// 			unit: 'encounter',
// 			applyVerb: (temporalUnit, species, usePlural) =>
// 				`${temporalUnit && `${printTemporalUnit(temporalUnit, usePlural)} with`}  most encounters`,
// 			category: 'count'
// 		},
// 		generator: getTopByProperty('encounter_count'),
// 		condition: (temporalUnit: TemporalUnit) => temporalUnit !== 'day'
// 	},
// 	{
// 		statsSelector: (stats: CoreStatsRepository) => stats.overall,
// 		descriptor: {
// 			type: 'species',
// 			unit: 'species',
// 			applyVerb: (temporalUnit, species, usePlural) =>
// 				`Most varied ${printTemporalUnit(temporalUnit, usePlural)}`,
// 			category: 'count'
// 		},
// 		generator: getTopByProperty('species_count'),
// 		condition: (
// 			temporalUnit: TemporalUnit,
// 			parentTimeWindow?: YearMonthRestriction
// 		) => !parentTimeWindow?.month
// 	},
// 	{
// 		statsSelector: (stats: CoreStatsRepository) => stats.overall,
// 		descriptor: {
// 			type: 'newBirds',
// 			category: 'count',
// 			unit: 'bird',
// 			applyVerb: (temporalUnit, species, usePlural) =>
// 				`${temporalUnit && `${printTemporalUnit(temporalUnit, usePlural)} with`} most new birds`
// 		},
// 		generator: getTopByProperty('new_bird_count'),
// 		condition: (
// 			temporalUnit: TemporalUnit,
// 			parentTimeWindow?: YearMonthRestriction
// 		) => !parentTimeWindow?.month
// 	},
// 	{
// 		statsSelector: (stats: CoreStatsRepository) => stats.overall,
// 		descriptor: {
// 			type: 'young',
// 			category: 'count',
// 			unit: 'bird',
// 			applyVerb: (temporalUnit, species, usePlural) =>
// 				`${temporalUnit && `${printTemporalUnit(temporalUnit, usePlural)} with`}  most young birds`
// 		},
// 		generator: getTopByPropertiesSum([
// 			'pullus_bird_count',
// 			'juv_bird_count',
// 			'postjuv_bird_count'
// 		]),
// 		condition: (
// 			temporalUnit: TemporalUnit,
// 			parentTimeWindow?: YearMonthRestriction
// 		) => !parentTimeWindow?.month
// 	},
// 	{
// 		statsSelector: (stats: CoreStatsRepository) => stats.withSpecies,
// 		descriptor: {
// 			type: 'singleSpeciesCount',
// 			category: 'count',
// 			unit: 'bird',
// 			applyVerb: (temporalUnit, species, usePlural) =>
// 				`Highest single species count ${
// 					temporalUnit! == 'day'
// 						? `in a ${printTemporalUnit(temporalUnit, usePlural)}`
// 						: ''
// 				}`,
// 			speciesUnitMode: 'replace'
// 		},
// 		generator: getTopByProperty('bird_count'),
// 		condition: (
// 			temporalUnit: TemporalUnit,
// 			parentTimeWindow?: YearMonthRestriction
// 		) => !parentTimeWindow?.month
// 	},
// 	{
// 		statsSelector: (stats: CoreStatsRepository) => stats.withSpecies,
// 		descriptor: {
// 			type: 'singleSpeciesEncounters',
// 			category: 'count',
// 			unit: 'encounter',
// 			applyVerb: (temporalUnit, species, usePlural) =>
// 				`Most single species encounters in a ${printTemporalUnit(temporalUnit, usePlural)}`,
// 			speciesUnitMode: 'prefix'
// 		},
// 		generator: getTopByProperty('encounter_count'),
// 		condition: (
// 			temporalUnit: TemporalUnit,
// 			parentTimeWindow?: YearMonthRestriction
// 		) => temporalUnit !== 'day' && !parentTimeWindow?.month
// 	},
// 	{
// 		statsSelector: (stats: CoreStatsRepository) => stats.bySpecies,
// 		descriptor: {
// 			type: 'eachSpeciesCount',
// 			category: 'count',
// 			unit: 'bird',
// 			applyVerb: (temporalUnit, species, usePlural) =>
// 				`Most ${species} in a ${printTemporalUnit(temporalUnit, usePlural)}`,
// 			speciesUnitMode: 'replace'
// 		},
// 		generator: getTopByProperty('encounter_count', { threshold: 1 }),
// 		condition: (
// 			temporalUnit: TemporalUnit,
// 			parentTimeWindow?: YearMonthRestriction
// 		) => !parentTimeWindow?.month
// 	},
// 	{
// 		statsSelector: (stats: CoreStatsRepository) => stats.bySpecies,
// 		descriptor: {
// 			type: 'eachSpeciesYoung',
// 			category: 'count',
// 			unit: 'bird',
// 			applyVerb: (temporalUnit, species, usePlural) =>
// 				`Most young ${species} in a ${printTemporalUnit(temporalUnit, usePlural)}`,
// 			speciesUnitMode: 'replace'
// 		},
// 		generator: getTopByPropertiesSum([
// 			'pullus_bird_count',
// 			'juv_bird_count',
// 			'postjuv_bird_count'
// 		]),
// 		limit: 1,
// 		condition: (
// 			temporalUnit: TemporalUnit,
// 			parentTimeWindow?: YearMonthRestriction
// 		) => !parentTimeWindow?.month
// 	}
// ];
