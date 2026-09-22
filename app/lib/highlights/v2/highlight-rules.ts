import type { HighlightValue, HighlightsGenerator } from './types';
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

function getTopByPropertiesSum(
	statsKey: 'overall' | 'withSpecies',
	properties: (keyof CoreStatsResult)[],
	options?: HighlightFinderOptions
): (stats: StatsRepository<CoreStatsResult>) => HighlightValue[] {
	const { threshold } = {
		...DEFAULT_OPTIONS,
		...(options || {})
	};
	return (rawStats: StatsRepository<CoreStatsResult>) =>
		rawStats[statsKey]
			.map((row) => ({
				timePeriod: row.time_period as string,
				value: sumProperties(row, properties),
				species: row.species_name
			}))
			.filter((row) => row.value > threshold)
			.sort((a, b) => b.value - a.value);
}

function getTopByProperty(
	statsKey: 'overall' | 'withSpecies',
	property: keyof CoreStatsResult,
	options?: HighlightFinderOptions
): (stats: StatsRepository<CoreStatsResult>) => HighlightValue[] {
	return getTopByPropertiesSum(statsKey, [property], options);
}

export const highlightRules: HighlightsGenerator[] = [
	{
		descriptor: {
			type: 'birds',
			unit: 'bird',
			verb: 'Busiest',
			category: 'count'
		},
		generator: getTopByProperty('overall', 'bird_count')
	},
	{
		descriptor: {
			type: 'encounters',
			unit: 'encounter',
			verb: 'Most encounters per',
			category: 'count'
		},
		generator: getTopByProperty('overall', 'encounter_count'),
		condition: (temporalUnit: TemporalUnit) => temporalUnit !== 'day'
	},
	{
		descriptor: {
			type: 'species',
			unit: 'species',
			verb: 'Most varied',
			category: 'count'
		},
		generator: getTopByProperty('overall', 'species_count')
	},
	{
		descriptor: {
			type: 'newBirds',
			category: 'count',
			unit: 'bird',
			verb: 'Most new birds in a'
		},
		generator: getTopByProperty('overall', 'new_bird_count')
	},
	{
		descriptor: {
			type: 'juvs',
			category: 'count',
			unit: 'bird',
			verb: 'Most juveniles in a'
		},
		generator: getTopByPropertiesSum('overall', [
			'pullus_bird_count',
			'juv_bird_count',
			'postjuv_bird_count'
		])
	},
	{
		descriptor: {
			type: 'singleSpeciesCount',
			category: 'count',
			unit: 'bird',
			verb: 'Highest single species count in a',
			speciesUnitMode: 'replace'
		},
		generator: getTopByProperty('withSpecies', 'bird_count')
	},
	{
		descriptor: {
			type: 'singleSpeciesCount',
			category: 'count',
			unit: 'encounter',
			verb: 'MOst single encounters in a',
			speciesUnitMode: 'replace'
		},
		generator: getTopByProperty('withSpecies', 'encounter_count'),
		condition: (temporalUnit: TemporalUnit) => temporalUnit !== 'day'
	}
];
