import { isBefore, subMonths } from 'date-fns';
import type { SessionStatsData } from '@/app/models/highlights/shared/session-stats';
import type { SinceComparisonHighlight } from './types';
import { buildDayTotals } from './derive-session-total';

// Busiest/quietest-since compares the session's encounter total against
// prior session days only (later days can't have happened yet from the
// editorial's point of view):
// - busiest-since: the most recent prior day whose total >= the session's;
//   the session has been the busiest since that day. No qualifying prior day
//   means the session is the busiest ever — suppressed here, since the
//   all-time busiest record from the totals family already reports it.
// - quietest-since: the most recent prior day whose total <= the session's;
//   the session has been the quietest since that day. No qualifying prior day
//   means "Quietest session ever", except on the group's first session.
// Both are only reported when the since date is more than a month before the
// session (a recent since date isn't editorial-worthy), and when both qualify
// only the one with the earlier since date is reported.
export function deriveSinceHighlights({
	date,
	stats
}: {
	date: string;
	stats: SessionStatsData;
}): SinceComparisonHighlight[] {
	const sessionDate = new Date(date);
	const dayTotals = buildDayTotals(stats);
	const currentDay = dayTotals.find((day) => day.date === date);
	if (!currentDay) return [];
	const sessionValue = currentDay.encounters;
	const priorDays = dayTotals
		.filter((day) => day.date < date)
		.sort((a, b) => a.date.localeCompare(b.date));

	// A since date only counts as "more than a month before the session" when
	// it falls strictly before the day one month prior to the session
	const oneMonthBeforeSession = subMonths(sessionDate, 1);
	const isOverAMonthBefore = (sinceDate: string) =>
		isBefore(new Date(sinceDate), oneMonthBeforeSession);

	const busiestSinceDate = priorDays
		.filter((day) => day.encounters >= sessionValue)
		.map((day) => day.date)
		.at(-1);
	const quietestSinceDate = priorDays
		.filter((day) => day.encounters <= sessionValue)
		.map((day) => day.date)
		.at(-1);

	const candidates: SinceComparisonHighlight[] = [];
	// Busiest is suppressed with no qualifying prior day — that case is the
	// all-time busiest record, already covered by the totals family
	if (busiestSinceDate !== undefined && isOverAMonthBefore(busiestSinceDate)) {
		candidates.push({
			type: 'since-comparison',
			kind: 'busiest',
			value: sessionValue,
			sinceDate: busiestSinceDate
		});
	}
	if (quietestSinceDate === undefined) {
		// No prior day matched or undershot — quietest ever, unless this is the
		// group's first session (nothing to be quieter than)
		if (priorDays.length > 0) {
			candidates.push({
				type: 'since-comparison',
				kind: 'quietest',
				value: sessionValue
			});
		}
	} else if (isOverAMonthBefore(quietestSinceDate)) {
		candidates.push({
			type: 'since-comparison',
			kind: 'quietest',
			value: sessionValue,
			sinceDate: quietestSinceDate
		});
	}

	if (candidates.length < 2) return candidates;
	// Both qualify — report only the one with the earlier since date. A
	// quietest-ever highlight has no since date but reaches back further than
	// any dated comparison, so it always wins the tie-break.
	const earliest = candidates.reduce((earlier, candidate) => {
		if (earlier.sinceDate === undefined) return earlier;
		if (candidate.sinceDate === undefined) return candidate;
		return candidate.sinceDate < earlier.sinceDate ? candidate : earlier;
	});
	return [earliest];
}
