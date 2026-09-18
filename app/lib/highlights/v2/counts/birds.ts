import { CoreStatsResult } from '@/app/models/db';
const DEFAULT_OPTIONS = { limit: 3, threshold: 0 };
export function birdCounts(
	rawStats: CoreStatsResult[],
	options: {
		limit: number;
		threshold: number;
	} = DEFAULT_OPTIONS
) {
	return rawStats
		.filter(({ bird_count }) => bird_count > options.threshold)
		.sort((a, b) => a.bird_count - b.bird_count)
		.slice(0, options.limit);
}
