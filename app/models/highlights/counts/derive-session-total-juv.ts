import { differenceInYears } from 'date-fns';
import {
	getScopeMatcher,
	RECORD_SCOPES
} from '@/app/models/highlights/shared/record-scope';
import type { SessionStatsData } from '@/app/models/highlights/shared/session-stats';
import type { SessionTotalJuvRecordHighlight } from './types';
import { buildDayTotals } from './derive-session-total';

// The session's total juvenile count, ranked against every other day in scope.
// Mirrors deriveSessionTotalRecords for the single 'juvs' measure: a strict
// record at the broadest scope it holds, or an all-time tie that has stood a
// year or more. A session with no juveniles is never a record (a "most juvs
// ever — 0" line is meaningless), so a zero total is skipped.
export function deriveSessionTotalJuvRecords({
	date,
	stats,
	today = new Date()
}: {
	date: string;
	stats: SessionStatsData;
	today?: Date;
}): SessionTotalJuvRecordHighlight[] {
	const sessionDate = new Date(date);
	const dayTotals = buildDayTotals(stats);
	const currentDay = dayTotals.find((day) => day.date === date);
	if (!currentDay) return [];
	const sessionValue = currentDay.juvs;
	// No juveniles this session — nothing to report
	if (sessionValue === 0) return [];

	const highlights: SessionTotalJuvRecordHighlight[] = [];
	for (const scope of RECORD_SCOPES) {
		const scopeMatcher = getScopeMatcher(scope, sessionDate);
		const otherDaysInScope = dayTotals.filter(
			(day) => day.date !== date && scopeMatcher(day.date)
		);
		// A record is only meaningful against at least one other session
		if (otherDaysInScope.length === 0) continue;
		const bestOtherValue = Math.max(...otherDaysInScope.map((day) => day.juvs));
		const baseHighlight = {
			type: 'session-total-juv-record',
			scope,
			value: sessionValue,
			year: sessionDate.getFullYear(),
			isCurrentYear: sessionDate.getFullYear() === today.getFullYear()
		} satisfies SessionTotalJuvRecordHighlight;
		if (sessionValue > bestOtherValue) {
			highlights.push(baseHighlight);
			break;
		}
		if (sessionValue === bestOtherValue && scope === 'all-time') {
			// The for-N-years copy describes how long the record stood, so only
			// prior tied days count towards it; a later-only tie is unreportable
			const mostRecentPriorTieDate = otherDaysInScope
				.filter((day) => day.juvs === bestOtherValue && day.date < date)
				.map((day) => day.date)
				.sort()
				.at(-1);
			if (mostRecentPriorTieDate !== undefined) {
				const recordEqualledYearsAgo = differenceInYears(
					sessionDate,
					new Date(mostRecentPriorTieDate)
				);
				if (recordEqualledYearsAgo >= 1) {
					highlights.push({ ...baseHighlight, recordEqualledYearsAgo });
					break;
				}
			}
		}
		// beaten or unreportable tie at this scope — a narrower scope may still
		// hold a strict record
	}
	return highlights;
}
