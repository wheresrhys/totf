import { fetchDailyStats } from '@/app/actions/highlights-data';
import { execute as counts } from './counts';
export async function highlights(groupId: number) {
	const dailyStats = await fetchDailyStats(groupId);

	return {
		overall: {
			counts: counts(dailyStats.overall)
		}
		// bySpecies: {
		//   // todo - upstream turn bySpecies into a better data structure to work with
		//   counts: counts(dailyStats.bySpecies)
		// }
	};
}
