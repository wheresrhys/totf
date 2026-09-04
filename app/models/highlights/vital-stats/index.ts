import type { SessionStatsData } from '@/app/models/highlights/shared/session-stats';
import { deriveWeightRecordBreakers } from './derive-weight-record';
import { combineWeightRecords } from './rules/combine-weight-records';
import type { VitalStatHighlight } from './types';

export { deriveWeightRecordBreakers } from './derive-weight-record';
export { combineWeightRecords } from './rules/combine-weight-records';
export * from './types';

// Runs the Vital-stats group's derive -> rules pipeline, then composes the
// final ordered list — a single block, per #408 ("all-time weight → this-year
// weight"). Derivation already iterates each species' scopes all-time-first
// (see deriveWeightRecordBreakers), so the rules-output pool is left as-is
// rather than re-sorted globally by scope: preserving generation order already
// gives "all-time before this-year" *per species*, matching #408's principle,
// without introducing a cross-species reordering that isn't this ticket's
// call to make (#414, "Vital-stats: weight records", owns the group's full
// editorial composition).
export function runVitalStatsGroup({
	date,
	stats,
	today = new Date()
}: {
	date: string;
	stats: SessionStatsData;
	today?: Date;
}): VitalStatHighlight[] {
	const pool: VitalStatHighlight[] = [
		...deriveWeightRecordBreakers({ date, stats, today })
	];
	return combineWeightRecords(pool);
}
