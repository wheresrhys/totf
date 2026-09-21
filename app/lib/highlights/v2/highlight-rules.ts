import type {
	Highlight,
	HighlightsOfType,
	HighlightTemporalUnit
} from './types';
import type { CoreStatsResult } from '@/app/models/db';

export const DEFAULT_OPTIONS = { limit: 3, threshold: 0 };

type HighlightsGenerator = Omit<
	HighlightsOfType,
	'highlights' | 'temporalUnit'
> & {
	generator: (stats: CoreStatsResult[]) => Highlight[];
	condition?: (temporalUnit: HighlightTemporalUnit) => boolean;
};
interface TimePeriodedItem {
	time_period: string | null;
}

type HighlightFinderOptions = {
	threshold?: number;
};

function sumProperties<T>(item: T, properties: (keyof T)[]) {
	return properties.reduce(
		(sum, property) => sum + ((item[property] as number) ?? 0),
		0
	);
}

function getTopByPropertiesSum<T extends TimePeriodedItem>(
	properties: (keyof T)[],
	options?: HighlightFinderOptions
): (stats: T[]) => Highlight[] {
	const { threshold } = {
		...DEFAULT_OPTIONS,
		...(options || {})
	};
	return (rawStats: T[]) =>
		rawStats
			.map((item) => ({
				time_period: item.time_period as string,
				value: sumProperties(item, properties)
			}))
			.filter((item) => item.value > threshold)
			.sort((a, b) => b.value - a.value);
}

function getTopByProperty<T extends TimePeriodedItem>(
	property: keyof T,
	options?: HighlightFinderOptions
): (stats: T[]) => Highlight[] {
	return getTopByPropertiesSum([property], options);
}

export const highlightRules: HighlightsGenerator[] = [
	{
		type: 'birds',
		unit: 'bird',
		verb: 'Busiest',
		category: 'count',
		generator: getTopByProperty<CoreStatsResult>('bird_count')
	},
	{
		type: 'encounters',
		unit: 'encounter',
		verb: 'Most encounters per',
		category: 'count',
		generator: getTopByProperty<CoreStatsResult>('encounter_count'),
		condition: (temporalUnit: HighlightTemporalUnit) => temporalUnit !== 'day'
	},
	{
		type: 'species',
		unit: 'species',
		verb: 'Most varied',
		category: 'count',
		generator: getTopByProperty<CoreStatsResult>('species_count')
	},
	{
		type: 'newBirds',
		category: 'count',
		unit: 'bird',
		verb: 'Most new birds in a',
		generator: getTopByProperty<CoreStatsResult>('new_bird_count')
	},
	{
		type: 'juvs',
		category: 'count',
		unit: 'bird',
		verb: 'Most juveniles in a',
		generator: getTopByPropertiesSum<CoreStatsResult>([
			'pullus_bird_count',
			'juv_bird_count',
			'postjuv_bird_count'
		])
	}
];
