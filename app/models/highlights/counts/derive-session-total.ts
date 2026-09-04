import { differenceInYears } from 'date-fns';
import {
	getScopeMatcher,
	RECORD_SCOPES
} from '@/app/models/highlights/shared/record-scope';
import type { SessionStatsData } from '@/app/models/highlights/shared/session-stats';
import {
	SESSION_TOTAL_METRICS,
	type SessionTotalRecordHighlight
} from './types';

export type DayTotals = {
	date: string;
	encounters: number;
	species: number;
	juvs: number;
};

// Highlights compare the session against every other session in scope,
// whenever it happened — later data can erase or demote a record
export function buildDayTotals({
	daySpeciesStats,
	sessionDates
}: SessionStatsData): DayTotals[] {
	const totalsByDate = new Map<string, DayTotals>();
	for (const date of sessionDates) {
		totalsByDate.set(date, { date, encounters: 0, species: 0, juvs: 0 });
	}
	for (const row of daySpeciesStats) {
		const dayTotals = totalsByDate.get(row.visit_date) ?? {
			date: row.visit_date,
			encounters: 0,
			species: 0,
			juvs: 0
		};
		dayTotals.encounters += row.encounter_count;
		dayTotals.species += 1;
		dayTotals.juvs += row.juv_count;
		totalsByDate.set(row.visit_date, dayTotals);
	}
	return [...totalsByDate.values()];
}

export function deriveSessionTotalRecords({
	date,
	stats,
	today = new Date()
}: {
	date: string;
	stats: SessionStatsData;
	today?: Date;
}): SessionTotalRecordHighlight[] {
	const sessionDate = new Date(date);
	const dayTotals = buildDayTotals(stats);
	const currentDay = dayTotals.find((day) => day.date === date);
	if (!currentDay) return [];

	const highlights: SessionTotalRecordHighlight[] = [];
	for (const metric of SESSION_TOTAL_METRICS) {
		const sessionValue = currentDay[metric];
		for (const scope of RECORD_SCOPES) {
			const scopeMatcher = getScopeMatcher(scope, sessionDate);
			const otherDaysInScope = dayTotals.filter(
				(day) => day.date !== date && scopeMatcher(day.date)
			);
			// A record is only meaningful against at least one other session
			// (otherwise the group's only session is trivially a record)
			if (otherDaysInScope.length === 0) continue;
			const bestOtherValue = Math.max(
				...otherDaysInScope.map((day) => day[metric])
			);
			const baseHighlight = {
				type: 'session-total-record',
				metric,
				scope,
				value: sessionValue,
				year: sessionDate.getFullYear(),
				isCurrentYear: sessionDate.getFullYear() === today.getFullYear()
			} satisfies SessionTotalRecordHighlight;
			if (sessionValue > bestOtherValue) {
				highlights.push(baseHighlight);
				break;
			}
			if (sessionValue === bestOtherValue && scope === 'all-time') {
				// The for-N-years copy describes how long the record stood, so
				// only prior tied days count — a later-only tie is unreportable
				const mostRecentPriorTieDate = otherDaysInScope
					.filter((day) => day[metric] === bestOtherValue && day.date < date)
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
			// beaten or unreportable tie at this scope — a narrower scope may
			// exclude the offending day and still hold a strict record
		}
	}
	return highlights;
}
