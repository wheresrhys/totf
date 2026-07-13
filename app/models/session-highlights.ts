import { differenceInYears } from 'date-fns';
import {
	getSeasonMonths,
	getSeasonName,
	getSeasonPeriodLabel,
	isCurrentSeasonPeriod
} from '@/app/models/seasons';
import type { DaySpeciesMetricRow } from '@/app/models/db';

export const SESSION_TOTAL_METRICS = ['encounters', 'species'] as const;
export type SessionTotalMetric = (typeof SESSION_TOTAL_METRICS)[number];

// Broadest first — a record is reported at the broadest scope it holds
export const RECORD_SCOPES = [
	'all-time',
	'any-season',
	'this-year',
	'this-season'
] as const;
export type RecordScope = (typeof RECORD_SCOPES)[number];

// Everything needed to compare a session against the group's history,
// fetched once per group: per-day-per-species encounter counts plus the
// full list of session dates (so zero-encounter sessions still count)
export type SessionStatsData = {
	daySpeciesCounts: DaySpeciesMetricRow[];
	sessionDates: string[];
};

export type SessionTotalRecordHighlight = {
	type: 'session-total-record';
	metric: SessionTotalMetric;
	scope: RecordScope;
	value: number;
	seasonName: string;
	year: number;
	// 'this year' / 'this autumn' copy is only correct while the session's
	// period is still current; otherwise the sentence uses the absolute labels
	isCurrentYear: boolean;
	isCurrentSeason: boolean;
	seasonPeriodLabel: string;
	// Set only for all-time ties where the equalled record is over a year old
	recordEqualledYearsAgo?: number;
};

export type SessionHighlight = SessionTotalRecordHighlight;

type DayTotals = {
	date: string;
	encounters: number;
	species: number;
};

// Highlights describe the session as it would have read on the day, so
// every comparison only considers data up to and including the session date
export function buildDayTotals(
	{ daySpeciesCounts, sessionDates }: SessionStatsData,
	sessionDate: string
): DayTotals[] {
	const totalsByDate = new Map<string, DayTotals>();
	for (const date of sessionDates) {
		if (date > sessionDate) continue;
		totalsByDate.set(date, { date, encounters: 0, species: 0 });
	}
	for (const row of daySpeciesCounts) {
		if (row.visit_date > sessionDate) continue;
		const dayTotals = totalsByDate.get(row.visit_date) ?? {
			date: row.visit_date,
			encounters: 0,
			species: 0
		};
		dayTotals.encounters += row.metric_value;
		dayTotals.species += 1;
		totalsByDate.set(row.visit_date, dayTotals);
	}
	return [...totalsByDate.values()];
}

function getScopeMatcher(
	scope: RecordScope,
	sessionDate: Date
): (date: string) => boolean {
	switch (scope) {
		case 'all-time':
			return () => true;
		case 'any-season': {
			const seasonMonths = getSeasonMonths(sessionDate, false) as number[];
			return (date) => seasonMonths.includes(Number(date.slice(5, 7)));
		}
		case 'this-year': {
			const yearPrefix = `${sessionDate.getFullYear()}-`;
			return (date) => date.startsWith(yearPrefix);
		}
		case 'this-season': {
			const seasonYearMonths = getSeasonMonths(sessionDate, true) as string[];
			return (date) => seasonYearMonths.includes(date.slice(0, 7));
		}
	}
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
	const dayTotals = buildDayTotals(stats, date);
	const currentDay = dayTotals.find((day) => day.date === date);
	if (!currentDay) return [];

	const highlights: SessionTotalRecordHighlight[] = [];
	for (const metric of SESSION_TOTAL_METRICS) {
		const sessionValue = currentDay[metric];
		for (const scope of RECORD_SCOPES) {
			const scopeMatcher = getScopeMatcher(scope, sessionDate);
			const priorDays = dayTotals.filter(
				(day) => day.date < date && scopeMatcher(day.date)
			);
			// A record is only meaningful against at least one prior session
			// (otherwise the group's first session is trivially a record)
			if (priorDays.length === 0) continue;
			const previousBest = Math.max(...priorDays.map((day) => day[metric]));
			const baseHighlight: SessionTotalRecordHighlight = {
				type: 'session-total-record',
				metric,
				scope,
				value: sessionValue,
				seasonName: getSeasonName(sessionDate),
				year: sessionDate.getFullYear(),
				isCurrentYear: sessionDate.getFullYear() === today.getFullYear(),
				isCurrentSeason: isCurrentSeasonPeriod(sessionDate, today),
				seasonPeriodLabel: getSeasonPeriodLabel(sessionDate)
			};
			if (sessionValue > previousBest) {
				highlights.push(baseHighlight);
				break;
			}
			if (sessionValue === previousBest && scope === 'all-time') {
				const mostRecentTieDate = priorDays
					.filter((day) => day[metric] === previousBest)
					.map((day) => day.date)
					.sort()
					.at(-1)!;
				const recordEqualledYearsAgo = differenceInYears(
					sessionDate,
					new Date(mostRecentTieDate)
				);
				if (recordEqualledYearsAgo >= 1) {
					highlights.push({ ...baseHighlight, recordEqualledYearsAgo });
					break;
				}
			}
			// beaten or unreportable tie at this scope — a narrower scope may
			// exclude the offending day and still hold a strict record
		}
	}
	return highlights;
}

const HIGHLIGHT_TYPE_PRIORITY: SessionHighlight['type'][] = [
	'session-total-record'
];

export function sortHighlights(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	return [...highlights].sort(
		(a, b) =>
			HIGHLIGHT_TYPE_PRIORITY.indexOf(a.type) -
			HIGHLIGHT_TYPE_PRIORITY.indexOf(b.type)
	);
}

const SESSION_TOTAL_METRIC_COPY: Record<
	SessionTotalMetric,
	{ descriptor: string; unit: string }
> = {
	encounters: { descriptor: 'Busiest', unit: 'birds' },
	species: { descriptor: 'Most varied', unit: 'species' }
};

function buildSessionTotalRecordSentence(
	highlight: SessionTotalRecordHighlight
): string {
	const { descriptor, unit } = SESSION_TOTAL_METRIC_COPY[highlight.metric];
	const valueCopy = `${highlight.value} ${unit}`;
	if (highlight.recordEqualledYearsAgo !== undefined) {
		const yearsCopy = `${highlight.recordEqualledYearsAgo} ${highlight.recordEqualledYearsAgo === 1 ? 'year' : 'years'}`;
		return `${descriptor} session for ${yearsCopy} — ${valueCopy}`;
	}
	switch (highlight.scope) {
		case 'all-time':
			return `${descriptor} session ever — ${valueCopy}`;
		case 'any-season':
			return `${descriptor} ${highlight.seasonName} session ever — ${valueCopy}`;
		case 'this-year':
			return highlight.isCurrentYear
				? `${descriptor} session this year — ${valueCopy}`
				: `${descriptor} session of ${highlight.year} — ${valueCopy}`;
		case 'this-season':
			return highlight.isCurrentSeason
				? `${descriptor} session this ${highlight.seasonName} — ${valueCopy}`
				: `${descriptor} session in ${highlight.seasonPeriodLabel} — ${valueCopy}`;
	}
}

export function buildHighlightSentence(highlight: SessionHighlight): string {
	switch (highlight.type) {
		case 'session-total-record':
			return buildSessionTotalRecordSentence(highlight);
	}
}
