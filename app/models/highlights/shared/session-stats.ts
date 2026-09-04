import type { StatsPerDayAndSpeciesResult } from '@/app/models/db';

// Everything needed to compare a session against the group's history,
// fetched once per group: per-day-per-species stats (encounter counts,
// weighed-bird counts, weight extremes) plus the full list of session
// dates (so zero-encounter sessions still count). Shared input shape for
// every group's derive functions (rarities, counts, vital-stats).
export type SessionStatsData = {
	daySpeciesStats: StatsPerDayAndSpeciesResult[];
	sessionDates: string[];
};
