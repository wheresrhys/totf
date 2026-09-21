import type { HighlightValue, HighlightsGenerator } from './types';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
import type { CoreStatsResult } from '@/app/models/db';

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
	properties: (keyof CoreStatsResult)[],
	options?: HighlightFinderOptions
): (stats: CoreStatsResult[]) => HighlightValue[] {
	const { threshold } = {
		...DEFAULT_OPTIONS,
		...(options || {})
	};
	return (rawStats: CoreStatsResult[]) =>
		rawStats
			.map((item) => ({
				timePeriod: item.time_period as string,
				value: sumProperties(item, properties)
			}))
			.filter((item) => item.value > threshold)
			.sort((a, b) => b.value - a.value);
}

function getTopByProperty(
	property: keyof CoreStatsResult,
	options?: HighlightFinderOptions
): (stats: CoreStatsResult[]) => HighlightValue[] {
	return getTopByPropertiesSum([property], options);
}

export const highlightRules: HighlightsGenerator[] = [
	{
		descriptor: {
			type: 'birds',
			unit: 'bird',
			verb: 'Busiest',
			category: 'count'
		},
		generator: getTopByProperty('bird_count')
	},
	{
		descriptor: {
			type: 'encounters',
			unit: 'encounter',
			verb: 'Most encounters per',
			category: 'count'
		},
		generator: getTopByProperty('encounter_count'),
		condition: (temporalUnit: TemporalUnit) => temporalUnit !== 'day'
	},
	{
		descriptor: {
			type: 'species',
			unit: 'species',
			verb: 'Most varied',
			category: 'count'
		},
		generator: getTopByProperty('species_count')
	},
	{
		descriptor: {
			type: 'newBirds',
			category: 'count',
			unit: 'bird',
			verb: 'Most new birds in a'
		},
		generator: getTopByProperty('new_bird_count')
	},
	{
		descriptor: {
			type: 'juvs',
			category: 'count',
			unit: 'bird',
			verb: 'Most juveniles in a'
		},
		generator: getTopByPropertiesSum([
			'pullus_bird_count',
			'juv_bird_count',
			'postjuv_bird_count'
		])
	}
];
