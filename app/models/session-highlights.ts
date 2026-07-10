import { differenceInYears } from 'date-fns';
import { getSeasonMonths, getSeasonName } from '@/app/models/seasons';
import type { TopMetricsFilterParams, TopPeriodsResult } from '@/app/models/db';

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

export type ScopeFilters = {
	scope: RecordScope;
	filters: Partial<TopMetricsFilterParams>;
};

export type SessionTotalRecordHighlight = {
	type: 'session-total-record';
	metric: SessionTotalMetric;
	scope: RecordScope;
	value: number;
	seasonName: string;
	year: number;
	// Set only for all-time ties where the equalled record is over a year old
	recordEqualledYearsAgo?: number;
};

export type SessionHighlight = SessionTotalRecordHighlight;

export type ScopedTopPeriods = {
	scope: RecordScope;
	rows: TopPeriodsResult[];
};

export function getScopeFilters(
	sessionDate: Date,
	ringingGroupId: number
): ScopeFilters[] {
	return [
		{
			scope: 'all-time',
			filters: { ringing_group_filter: ringingGroupId }
		},
		{
			scope: 'any-season',
			filters: {
				ringing_group_filter: ringingGroupId,
				months_filter: getSeasonMonths(sessionDate, false) as number[]
			}
		},
		{
			scope: 'this-year',
			filters: {
				ringing_group_filter: ringingGroupId,
				year_filter: sessionDate.getFullYear()
			}
		},
		{
			scope: 'this-season',
			filters: {
				ringing_group_filter: ringingGroupId,
				exact_months_filter: getSeasonMonths(sessionDate, true) as string[]
			}
		}
	];
}

export function deriveSessionTotalRecords({
	date,
	resultsByMetric
}: {
	date: string;
	resultsByMetric: Record<SessionTotalMetric, ScopedTopPeriods[]>;
}): SessionTotalRecordHighlight[] {
	const sessionDate = new Date(date);
	const highlights: SessionTotalRecordHighlight[] = [];
	for (const metric of SESSION_TOTAL_METRICS) {
		const scopedResults = resultsByMetric[metric] ?? [];
		for (const scope of RECORD_SCOPES) {
			const rows =
				scopedResults.find((result) => result.scope === scope)?.rows ?? [];
			const [topRow, runnerUpRow] = rows;
			if (!topRow || topRow.visit_date !== date) continue;
			const baseHighlight: SessionTotalRecordHighlight = {
				type: 'session-total-record',
				metric,
				scope,
				value: topRow.metric_value,
				seasonName: getSeasonName(sessionDate),
				year: sessionDate.getFullYear()
			};
			const isTie = runnerUpRow?.metric_value === topRow.metric_value;
			if (!isTie) {
				highlights.push(baseHighlight);
				break;
			}
			if (scope === 'all-time') {
				const recordEqualledYearsAgo = differenceInYears(
					sessionDate,
					new Date(runnerUpRow.visit_date)
				);
				if (recordEqualledYearsAgo >= 1) {
					highlights.push({ ...baseHighlight, recordEqualledYearsAgo });
					break;
				}
			}
			// unreportable tie at this scope — a narrower scope may still be a strict record
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
			return `${descriptor} session of ${highlight.year} — ${valueCopy}`;
		case 'this-season':
			return `${descriptor} session this ${highlight.seasonName} — ${valueCopy}`;
	}
}

export function buildHighlightSentence(highlight: SessionHighlight): string {
	switch (highlight.type) {
		case 'session-total-record':
			return buildSessionTotalRecordSentence(highlight);
	}
}
