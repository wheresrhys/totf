import type { StatsPerDayAndSpeciesResult } from '@/app/models/db';

// Everything needed to compare a session against the group's history,
// fetched once per group: per-day-per-species stats (encounter counts,
// weighed-bird counts, weight extremes) plus the full list of session
// dates (so zero-encounter sessions still count). Input shape for every
// derive function still on this side of the split — vital-stats and the
// long-absence-retrap sibling (Rarities and Counts moved to the v2 pipeline,
// which reads core_stats through app/actions/stats-cache.ts instead).
export type SessionStatsData = {
	daySpeciesStats: StatsPerDayAndSpeciesResult[];
	sessionDates: string[];
};
