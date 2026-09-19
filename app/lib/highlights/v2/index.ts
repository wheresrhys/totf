import { fetchDailyStats, type RawStats } from '@/app/actions/highlights-data';
import type { CoreStatsResult } from '@/app/models/db';
const DEFAULT_OPTIONS = { limit: 3, threshold: 0 };

type HighlightFinderOptions = {
	limit?: number;
	threshold?: number;
};

function sumProperties<T>(item: T, properties: (keyof T)[]) {
	return properties.reduce(
		(sum, property) => sum + ((item[property] as number) ?? 0),
		0
	);
}

function getTopByPropertiesSum<T>(
	properties: (keyof T)[],
	rawStats: T[],
	options?: HighlightFinderOptions
) {
	const { threshold, limit } = { ...(options || {}), ...DEFAULT_OPTIONS };
	return rawStats
		.filter((item) => sumProperties(item, properties) > threshold)
		.sort((a, b) => sumProperties(a, properties) - sumProperties(b, properties))
		.slice(0, limit);
}

function getTopByProperty<T>(
	property: keyof T,
	rawStats: T[],
	options?: HighlightFinderOptions
) {
	return getTopByPropertiesSum([property], rawStats, options);
}

function generateHighlights(stats: RawStats) {
	return {
		overall: {
			counts: {
				birds: getTopByProperty<CoreStatsResult>('bird_count', stats.overall),
				encounters: getTopByProperty<CoreStatsResult>(
					'encounter_count',
					stats.overall
				),
				species: getTopByProperty<CoreStatsResult>(
					'species_count',
					stats.overall
				),
				newBirds: getTopByProperty<CoreStatsResult>(
					'new_bird_count',
					stats.overall
				),
				juvs: getTopByPropertiesSum<CoreStatsResult>(
					['pullus_bird_count', 'juv_bird_count', 'postjuv_bird_count'],
					stats.overall
				)
			}
		}
		// bySpecies: {
		//   // todo - upstream turn bySpecies into a better data structure to work with
		//   counts: counts(dailyStats.bySpecies)
		// }
	};
}

export async function dailyHighlights(groupId: number) {
	const dailyStats = await fetchDailyStats(groupId);
	return generateHighlights(dailyStats);
}
