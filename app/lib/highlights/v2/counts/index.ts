import { birdCounts } from './birds';

export function execute(rawStats: CoreStatsResult[]) {
	return {
		birdCounts: birdCounts(rawStats)
	};
}
