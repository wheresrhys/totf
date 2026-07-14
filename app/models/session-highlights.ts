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

export type SpeciesCountRecordHighlight = {
	type: 'species-count-record';
	speciesName: string;
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
	// Set only for all-time placements: 1 for a tie with the current record
	// under a year old, 2/3 for days ranking behind the record
	placementRank?: 1 | 2 | 3;
	// True when a prior day matches the session's count exactly
	isJointPlacement?: boolean;
};

export type FirstEverSpeciesHighlight = {
	type: 'first-ever-species';
	speciesName: string;
	// Set only when the session holds the species' only records ever
	// (no other day in the data, before or after); drives pluralisation
	onlyRecordCount?: number;
};

export type FirstOfYearSpeciesHighlight = {
	type: 'first-of-year-species';
	speciesName: string;
	year: number;
	// 'of the year' copy is only correct while the session's year is current;
	// otherwise the sentence uses the absolute year
	isCurrentYear: boolean;
	// Set only when the session holds the species' only records this calendar
	// year (no other day in the year, before or after); drives pluralisation
	onlyRecordCount?: number;
};

export type SessionHighlight =
	| SessionTotalRecordHighlight
	| SpeciesCountRecordHighlight
	| FirstEverSpeciesHighlight
	| FirstOfYearSpeciesHighlight;

type PeriodFields = {
	scope: RecordScope;
	seasonName: string;
	year: number;
	isCurrentYear: boolean;
	isCurrentSeason: boolean;
	seasonPeriodLabel: string;
};

// Returns the scope-qualified phrase for "this year" / "this season" scopes
// where the copy changes depending on whether the period is still current.
// Handles the shared conditional logic for both session-total and species-record families.
// Returns null for all-time and any-season, which each family phrases differently.
// yearPreposition: 'in' for species-count ("the most in 2024"),
//                  'of' for session-total ("Busiest session of 2024")
export function buildCurrentPeriodScopePhrase(
	fields: PeriodFields,
	yearPreposition: 'in' | 'of' = 'in'
): string | null {
	switch (fields.scope) {
		case 'this-year':
			return fields.isCurrentYear
				? 'this year'
				: `${yearPreposition} ${fields.year}`;
		case 'this-season':
			return fields.isCurrentSeason
				? `this ${fields.seasonName}`
				: `in ${fields.seasonPeriodLabel}`;
		default:
			return null;
	}
}

type DayTotals = {
	date: string;
	encounters: number;
	species: number;
};

// Highlights compare the session against every other session in scope,
// whenever it happened — later data can erase or demote a record
export function buildDayTotals({
	daySpeciesCounts,
	sessionDates
}: SessionStatsData): DayTotals[] {
	const totalsByDate = new Map<string, DayTotals>();
	for (const date of sessionDates) {
		totalsByDate.set(date, { date, encounters: 0, species: 0 });
	}
	for (const row of daySpeciesCounts) {
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

// 2nd/3rd placements are only reported while the top tiers are sparsely
// held: 2nd place needs fewer than three other days at the top value, 3rd
// place needs fewer than three other days across the top two values. The
// session must also equal or exceed an included tier value — a count below
// every other value is not a placement, however thin the history.
function deriveAllTimePlacement(
	sessionValue: number,
	otherValues: number[]
): { placementRank: 2 | 3; isJointPlacement: boolean } | null {
	const distinctValuesDescending = [...new Set(otherValues)].sort(
		(a, b) => b - a
	);
	const [topValue, secondValue, thirdValue] = distinctValuesDescending;
	const daysAt = (value: number) =>
		otherValues.filter((otherValue) => otherValue === value).length;
	const includedValues = [topValue];
	if (secondValue !== undefined && daysAt(topValue) < 3) {
		includedValues.push(secondValue);
		if (
			thirdValue !== undefined &&
			daysAt(topValue) + daysAt(secondValue) < 3
		) {
			includedValues.push(thirdValue);
		}
	}
	const minIncludedValue = includedValues.at(-1)!;
	if (sessionValue < minIncludedValue || sessionValue >= topValue) return null;
	// The tier rule above means at most two other days can outrank a
	// qualifying value, so the rank is always 2 or 3
	const placementRank = (otherValues.filter(
		(otherValue) => otherValue > sessionValue
	).length + 1) as 2 | 3;
	return {
		placementRank,
		isJointPlacement: otherValues.includes(sessionValue)
	};
}

export function deriveSpeciesRecords({
	date,
	stats,
	today = new Date()
}: {
	date: string;
	stats: SessionStatsData;
	today?: Date;
}): SpeciesCountRecordHighlight[] {
	const sessionDate = new Date(date);
	const sessionRows = stats.daySpeciesCounts.filter(
		(row) => row.visit_date === date
	);
	if (sessionRows.length === 0) return [];

	const sharedFields = {
		seasonName: getSeasonName(sessionDate),
		year: sessionDate.getFullYear(),
		isCurrentYear: sessionDate.getFullYear() === today.getFullYear(),
		isCurrentSeason: isCurrentSeasonPeriod(sessionDate, today),
		seasonPeriodLabel: getSeasonPeriodLabel(sessionDate)
	};

	const highlights: SpeciesCountRecordHighlight[] = [];
	for (const sessionRow of sessionRows) {
		const { species_name: speciesName, metric_value: sessionValue } =
			sessionRow;
		// A single bird is never a notable count, whatever the history says
		if (sessionValue === 1) continue;
		for (const scope of RECORD_SCOPES) {
			const scopeMatcher = getScopeMatcher(scope, sessionDate);
			const otherRowsInScope = stats.daySpeciesCounts.filter(
				(row) =>
					row.species_name === speciesName &&
					row.visit_date !== date &&
					scopeMatcher(row.visit_date)
			);
			// A record requires the species to appear on at least one other day
			// in scope (otherwise it's first-ever territory, covered by #317)
			if (otherRowsInScope.length === 0) continue;
			const bestOtherValue = Math.max(
				...otherRowsInScope.map((row) => row.metric_value)
			);
			const baseHighlight: SpeciesCountRecordHighlight = {
				type: 'species-count-record',
				speciesName,
				scope,
				value: sessionValue,
				...sharedFields
			};
			if (sessionValue > bestOtherValue) {
				highlights.push(baseHighlight);
				break;
			}
			if (sessionValue === bestOtherValue && scope === 'all-time') {
				// The for-N-years copy describes how long the record stood, so
				// only prior tied days count towards it; a tie held only by a
				// later day still reads as a joint best day
				const mostRecentPriorTieDate = otherRowsInScope
					.filter(
						(row) =>
							row.metric_value === bestOtherValue && row.visit_date < date
					)
					.map((row) => row.visit_date)
					.sort()
					.at(-1);
				const recordEqualledYearsAgo =
					mostRecentPriorTieDate === undefined
						? 0
						: differenceInYears(sessionDate, new Date(mostRecentPriorTieDate));
				highlights.push(
					recordEqualledYearsAgo >= 1
						? { ...baseHighlight, recordEqualledYearsAgo }
						: { ...baseHighlight, placementRank: 1, isJointPlacement: true }
				);
				break;
			}
			if (scope === 'all-time') {
				const placement = deriveAllTimePlacement(
					sessionValue,
					otherRowsInScope.map((row) => row.metric_value)
				);
				if (placement) {
					highlights.push({ ...baseHighlight, ...placement });
					// no break — a narrower scope may still hold a strict record,
					// reported alongside the placement
				}
			}
			// beaten at this scope — a narrower scope may exclude the
			// offending day and still hold a strict record
		}
	}
	return highlights;
}

// Returns a highlight for each species seen for the first time on this session.
// Suppressed entirely for the group's first-ever session (every species would
// be first, making the highlights uninformative).
export function deriveFirstEverSpecies({
	date,
	stats
}: {
	date: string;
	stats: SessionStatsData;
}): FirstEverSpeciesHighlight[] {
	const sessionRows = stats.daySpeciesCounts.filter(
		(row) => row.visit_date === date
	);
	if (sessionRows.length === 0) return [];
	// Suppress on the group's first-ever session
	const priorSessionDates = stats.sessionDates.filter(
		(sessionDate) => sessionDate < date
	);
	if (priorSessionDates.length === 0) return [];
	// Find species with no appearance before this session
	return sessionRows
		.filter(
			(sessionRow) =>
				!stats.daySpeciesCounts.some(
					(row) =>
						row.species_name === sessionRow.species_name &&
						row.visit_date < date
				)
		)
		.map((sessionRow) => {
			// The species' only records ever — later days revoke this, so a
			// "first ever" can lose its "only" copy as more data arrives
			const isOnlyRecord = !stats.daySpeciesCounts.some(
				(row) =>
					row.species_name === sessionRow.species_name &&
					row.visit_date !== date
			);
			return {
				type: 'first-ever-species' as const,
				speciesName: sessionRow.species_name,
				...(isOnlyRecord ? { onlyRecordCount: sessionRow.metric_value } : {})
			};
		});
}

// Returns a highlight for each species seen for the first time this calendar
// year on this session. First-ever species are excluded (the broader
// first-ever highlight covers them), and the group's first session of the
// year is suppressed entirely (every species would trivially be first of
// the year).
export function deriveFirstOfYearSpecies({
	date,
	stats,
	today = new Date()
}: {
	date: string;
	stats: SessionStatsData;
	today?: Date;
}): FirstOfYearSpeciesHighlight[] {
	const sessionRows = stats.daySpeciesCounts.filter(
		(row) => row.visit_date === date
	);
	if (sessionRows.length === 0) return [];
	const yearPrefix = `${date.slice(0, 4)}-`;
	// Suppress on the group's first session of the year
	const priorSessionDatesThisYear = stats.sessionDates.filter(
		(sessionDate) => sessionDate.startsWith(yearPrefix) && sessionDate < date
	);
	if (priorSessionDatesThisYear.length === 0) return [];
	const year = Number(date.slice(0, 4));
	return sessionRows
		.filter((sessionRow) => {
			const priorDates = stats.daySpeciesCounts
				.filter(
					(row) =>
						row.species_name === sessionRow.species_name &&
						row.visit_date < date
				)
				.map((row) => row.visit_date);
			return (
				priorDates.length > 0 &&
				!priorDates.some((priorDate) => priorDate.startsWith(yearPrefix))
			);
		})
		.map((sessionRow) => {
			// The species' only records this calendar year — a later day in the
			// same year revokes this; prior-year records don't (they're what
			// makes it first-of-year rather than first-ever)
			const isOnlyRecordThisYear = !stats.daySpeciesCounts.some(
				(row) =>
					row.species_name === sessionRow.species_name &&
					row.visit_date !== date &&
					row.visit_date.startsWith(yearPrefix)
			);
			return {
				type: 'first-of-year-species' as const,
				speciesName: sessionRow.species_name,
				year,
				isCurrentYear: year === today.getFullYear(),
				...(isOnlyRecordThisYear
					? { onlyRecordCount: sessionRow.metric_value }
					: {})
			};
		});
}

const HIGHLIGHT_TYPE_PRIORITY: SessionHighlight['type'][] = [
	'session-total-record',
	'species-count-record',
	'first-ever-species',
	'first-of-year-species'
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

function buildYearsAgoCopy(yearsAgo: number): string {
	return `${yearsAgo} ${yearsAgo === 1 ? 'year' : 'years'}`;
}

function buildSessionTotalRecordSentence(
	highlight: SessionTotalRecordHighlight
): string {
	const { descriptor, unit } = SESSION_TOTAL_METRIC_COPY[highlight.metric];
	const valueCopy = `${highlight.value} ${unit}`;
	if (highlight.recordEqualledYearsAgo !== undefined) {
		return `${descriptor} session for ${buildYearsAgoCopy(highlight.recordEqualledYearsAgo)} — ${valueCopy}`;
	}
	const currentPeriodPhrase = buildCurrentPeriodScopePhrase(highlight, 'of');
	if (currentPeriodPhrase !== null) {
		return `${descriptor} session ${currentPeriodPhrase} — ${valueCopy}`;
	}
	// Remaining cases: all-time and any-season (this-year / this-season handled above)
	if (highlight.scope === 'any-season') {
		return `${descriptor} ${highlight.seasonName} session ever — ${valueCopy}`;
	}
	return `${descriptor} session ever — ${valueCopy}`;
}

function buildSpeciesCountRecordSentence(
	highlight: SpeciesCountRecordHighlight
): string {
	const { speciesName, value } = highlight;
	const valueCopy = `${value} caught`;
	if (highlight.recordEqualledYearsAgo !== undefined) {
		return `Record-equalling day for ${speciesName} — ${valueCopy}, most for ${buildYearsAgoCopy(highlight.recordEqualledYearsAgo)}`;
	}
	if (highlight.placementRank !== undefined) {
		const rankCopy = { 1: 'best', 2: '2nd-best', 3: '3rd-best' }[
			highlight.placementRank
		];
		const jointPrefix = highlight.isJointPlacement ? 'Joint ' : '';
		return `${jointPrefix}${rankCopy} day for ${speciesName} ever — ${value} birds`;
	}
	const currentPeriodPhrase = buildCurrentPeriodScopePhrase(highlight);
	const mostPhrase =
		currentPeriodPhrase !== null
			? `the most ${currentPeriodPhrase}`
			: highlight.scope === 'all-time'
				? 'the most ever'
				: `the most in any ${highlight.seasonName}`;
	return `Record day for ${speciesName} — ${valueCopy}, ${mostPhrase}`;
}

function buildOnlyRecordPhrase(speciesName: string, count: number): string {
	return `Only ${speciesName} record${count > 1 ? 's' : ''}`;
}

export function buildHighlightSentence(highlight: SessionHighlight): string {
	switch (highlight.type) {
		case 'session-total-record':
			return buildSessionTotalRecordSentence(highlight);
		case 'species-count-record':
			return buildSpeciesCountRecordSentence(highlight);
		case 'first-ever-species':
			return highlight.onlyRecordCount !== undefined
				? `${buildOnlyRecordPhrase(highlight.speciesName, highlight.onlyRecordCount)} ever`
				: `First ever ${highlight.speciesName} for the group`;
		case 'first-of-year-species': {
			const yearPhrase = highlight.isCurrentYear
				? 'of the year'
				: `of ${highlight.year}`;
			return highlight.onlyRecordCount !== undefined
				? `${buildOnlyRecordPhrase(highlight.speciesName, highlight.onlyRecordCount)} ${yearPhrase}`
				: `First ${highlight.speciesName} ${yearPhrase}`;
		}
	}
}
