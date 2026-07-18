import {
	differenceInYears,
	intervalToDuration,
	isBefore,
	subMonths
} from 'date-fns';
import type {
	StatsPerDayAndSpeciesResult,
	LongAbsenceRetrapsResult
} from '@/app/models/db';

export const SESSION_TOTAL_METRICS = ['encounters', 'species'] as const;
export type SessionTotalMetric = (typeof SESSION_TOTAL_METRICS)[number];

// Broadest first — a record is reported at the broadest scope it holds
export const RECORD_SCOPES = ['all-time', 'this-year'] as const;
export type RecordScope = (typeof RECORD_SCOPES)[number];

// Scopes ranked broadest-first (all-time = 0). Used by the narrower-scope
// removal rule and by the temporal component of a highlight's sort value.
export const SCOPE_BREADTH_RANK = new Map(
	RECORD_SCOPES.map((scope, index) => [scope, index])
);

// --- Highlight sort value ---
//
// Every highlight carries an explicit `sortValue`; the machine's final rule
// simply sorts by it (higher first). A scoped record's value is the sum of its
// temporal breadth (how far back the record reaches) and its conceptual breadth
// (a whole-session measure outranks a single-species one), so session measures
// for a recent period can outrank a single-species record over a broader one.
//
// Temporal points: all-time 2, this-year 1.
function temporalPoints(scope: RecordScope): number {
	return RECORD_SCOPES.length - SCOPE_BREADTH_RANK.get(scope)!;
}

// Conceptual points: session total (busiest) 3, session variety (most varied) 2,
// single-species 1. A tiny fraction of the conceptual points is folded in so that
// session measures win an equal-sum tie (e.g. busiest this-year beats a
// single-species all-time record) without relying on derivation order.
export function scopedSortValue(
	scope: RecordScope,
	conceptualPoints: number
): number {
	return temporalPoints(scope) + conceptualPoints + conceptualPoints / 100;
}

// Non-scoped families don't earn a value from scope + concept the way records
// do; instead each sits in a fixed editorial priority, either above every scoped
// record (LEADING — promoted to head the list) or below every scoped record
// (TRAILING). Rather than hand-pick magic numbers, we list each band's families
// in priority order and space them off the scoped range, so the "always above /
// always below a record" guarantee is enforced here rather than trusted to
// comments. Spacing is wide enough that a heavily merged line (combined value =
// base + combine increment per extra part) never crosses into a neighbour.

// The scoped band a record's sortValue can occupy. Floor: this-year
// single-species (1 + 1 + 0.01). Ceiling: a combined all-time busiest+most-varied
// record (2 + 3 + 0.03, plus one combine increment) — comfortably under 6.
const SCOPED_FLOOR = scopedSortValue('this-year', 1);
const SCOPED_CEILING = 6;
// Wider than any realistic combine increment, so merged lines stay in their band.
const FAMILY_SPACING = 1;

// Turns an ordered family list into a lookup of explicit sortValues, priority
// descending (first family highest). Every value clears `boundary` by at least
// one spacing step; `above` puts the whole band over the scoped ceiling, else
// under the scoped floor. Within a band, sortValue always decreases with the
// list index, so list order is the reported order.
function familySortValues<Family extends string>(
	families: readonly Family[],
	boundary: number,
	above: boolean
): Record<Family, number> {
	return Object.fromEntries(
		families.map((family, index) => {
			const stepsFromBoundary = above ? families.length - index : -(index + 1);
			return [family, boundary + stepsFromBoundary * FAMILY_SPACING];
		})
	) as Record<Family, number>;
}

// Promoted above every scoped record, highest priority first: an "only ever"
// record (the species' sole record in the data) outranks a plain first-ever,
// then rare-species, then long-absence-retrap.
const LEADING_FAMILIES = [
	'only-ever-species',
	'first-ever-species',
	'rare-species',
	'long-absence-retrap'
] as const;
export const LEADING_SORT_VALUES = familySortValues(
	LEADING_FAMILIES,
	SCOPED_CEILING,
	true
);

// The remaining non-scoped families sort below every scoped record, highest
// priority first.
const TRAILING_FAMILIES = [
	'since-comparison',
	'first-of-year-species',
	'weight-record'
] as const;
export const TRAILING_SORT_VALUES = familySortValues(
	TRAILING_FAMILIES,
	SCOPED_FLOOR,
	false
);

// Combining bumps the merged line above the parts it absorbed, by a step that
// grows with how many highlights were merged — a session with many merged
// records ranks its combined line higher.
export const COMBINE_INCREMENT = 0.1;
export function combinedSortValue(components: { sortValue: number }[]): number {
	return (
		Math.max(...components.map((component) => component.sortValue)) +
		COMBINE_INCREMENT * (components.length - 1)
	);
}

// Everything needed to compare a session against the group's history,
// fetched once per group: per-day-per-species stats (encounter counts,
// weighed-bird counts, weight extremes) plus the full list of session
// dates (so zero-encounter sessions still count)
export type SessionStatsData = {
	daySpeciesStats: StatsPerDayAndSpeciesResult[];
	sessionDates: string[];
};

export type SessionTotalRecordHighlight = {
	type: 'session-total-record';
	sortValue: number;
	metric: SessionTotalMetric;
	scope: RecordScope;
	value: number;
	year: number;
	// 'this year' copy is only correct while the session's year is still current;
	// otherwise the sentence uses the absolute year
	isCurrentYear: boolean;
	// Set only for all-time ties where the equalled record is over a year old
	recordEqualledYearsAgo?: number;
};

export type SpeciesCountRecordHighlight = {
	type: 'species-count-record';
	sortValue: number;
	speciesName: string;
	scope: RecordScope;
	value: number;
	year: number;
	// 'this year' copy is only correct while the session's year is still current;
	// otherwise the sentence uses the absolute year
	isCurrentYear: boolean;
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
	sortValue: number;
	speciesName: string;
	// More than one encounter of the species this session — 'record' vs 'records'
	multipleIndividualsRecorded: boolean;
	// The session holds the species' only records ever (no other day in the
	// data, before or after) — 'Only' copy instead of 'First'
	isOnlyRecord: boolean;
};

export type FirstOfYearSpeciesHighlight = {
	type: 'first-of-year-species';
	sortValue: number;
	speciesName: string;
	year: number;
	// 'of the year' copy is only correct while the session's year is current;
	// otherwise the sentence uses the absolute year
	isCurrentYear: boolean;
	// More than one encounter of the species this session — 'record' vs 'records'
	multipleIndividualsRecorded: boolean;
	// The session holds the species' only records this calendar year (no other
	// day in the year, before or after) — 'Only' copy instead of 'First'
	isOnlyRecord: boolean;
};

// A species the group has recorded on very few session days ever is always
// worth a mention when it turns up again. Excludes first-ever appearances,
// which the first-ever highlight covers with more specific copy.
export const MAX_RARE_SPECIES_SESSION_DAYS = 3;

export type RareSpeciesHighlight = {
	type: 'rare-species';
	sortValue: number;
	speciesName: string;
	// Distinct session days the species has ever been recorded on (2–3 here;
	// a count of 1 is a first-ever appearance, handled elsewhere)
	totalSessionDays: number;
};

export type LongAbsenceRetrapHighlight = {
	type: 'long-absence-retrap';
	sortValue: number;
	ringNo: string;
	speciesName: string;
	// ISO date string of the previous encounter (e.g. "2021-06-20")
	previousDate: string;
	// Gap in whole years and months (zero months omitted from copy)
	gapYears: number;
	gapMonths: number;
};

// A busiest/quietest comparison against the most recent prior session day
// that equalled or exceeded (busiest) / equalled or undershot (quietest) the
// session's encounter total — "Busiest session since 12 May 2023"
export const SINCE_COMPARISON_KINDS = ['busiest', 'quietest'] as const;
export type SinceComparisonKind = (typeof SINCE_COMPARISON_KINDS)[number];

export type SinceComparisonHighlight = {
	type: 'since-comparison';
	sortValue: number;
	kind: SinceComparisonKind;
	// The session's encounter total
	value: number;
	// ISO date of the most recent prior session day that matched the
	// comparison (undefined for a quietest-ever highlight — no prior day
	// undershot or matched the session)
	sinceDate?: string;
};

// Which end of the weight range the placement concerns this session
export const WEIGHT_RECORD_EXTREMES = ['heaviest', 'lightest'] as const;
export type WeightRecordExtreme = (typeof WEIGHT_RECORD_EXTREMES)[number];

export type WeightRecordHighlight = {
	type: 'weight-record';
	sortValue: number;
	speciesName: string;
	extreme: WeightRecordExtreme;
	// The session's weight for this extreme, in grams
	weight: number;
	// Where the session's weight ranks across every day the species was weighed
	// (1 = heaviest/lightest ever, capped at the top 3)
	placementRank: 1 | 2 | 3;
	// True when another day's extreme exactly matches the session's weight
	isJointPlacement: boolean;
};

// A combined session-total record: a session that holds both the busiest
// (encounters) and most-varied (species) record over the *same* scope, merged
// by the machine's combine pass into one "Busiest and most varied session"
// line. Carries the value for each metric plus the shared period fields.
export type CombinedSessionTotalRecordHighlight = {
	type: 'combined-session-total-record';
	sortValue: number;
	scope: RecordScope;
	encounterValue: number;
	speciesValue: number;
	year: number;
	isCurrentYear: boolean;
};

// Multiple "Only <species> records of the year" highlights merged by the
// machine's combine pass into one line listing every species. Always the
// only-of-year variant (isOnlyRecord) — first-of-year items are never merged.
export type CombinedOnlyOfYearHighlight = {
	type: 'combined-only-of-year';
	sortValue: number;
	// Species names in the order the source highlights appeared
	speciesNames: string[];
	year: number;
	isCurrentYear: boolean;
};

// Multiple "First ever <species> record(s)" highlights merged by the machine's
// combine pass into one "First ever A, B and C records" line. Only the "First
// ever" variant merges — "Only <species> records ever" (isOnlyRecord) items are
// left per-species. A combined line always covers at least two species, so the
// copy is always plural ("records") even if every part was singular.
export type CombinedFirstEverHighlight = {
	type: 'combined-first-ever';
	sortValue: number;
	// Species names in the order the source highlights appeared
	speciesNames: string[];
};

// Multiple "First <species> record(s) of the year" highlights merged by the
// machine's combine pass into one "First A, B and C records of the year" line.
// Only the "First of year" variant merges — the "Only ... of the year"
// (isOnlyRecord) items combine separately (CombinedOnlyOfYearHighlight). As with
// first-ever, the combined copy is always plural.
export type CombinedFirstOfYearHighlight = {
	type: 'combined-first-of-year';
	sortValue: number;
	// Species names in the order the source highlights appeared
	speciesNames: string[];
	year: number;
	isCurrentYear: boolean;
};

// Multiple "Record day for <species> — N caught, the most this year"
// highlights (all this-year scope) merged by the machine's combine pass into
// one "Highest A, B and C counts of the year" line. Drops the per-species
// count; keeps the shared year fields so the renderer can phrase the scope.
// The all-time scope never merges — its copy is per-species (placements,
// "the most ever").
export type CombinedSpeciesCountRecordHighlight = {
	type: 'combined-species-count-record';
	sortValue: number;
	// Only the this-year scope carries combinable per-species copy
	scope: 'this-year';
	// Species names in the order the source highlights appeared
	speciesNames: string[];
	year: number;
	isCurrentYear: boolean;
};

// The discriminated union the highlight machine's passes and the client
// renderers both operate over. Highlights are plain serializable data so they
// can cross the server-action -> client boundary; rendering happens client
// side (app/components/session-highlight-renderers.tsx).
export type SessionHighlight =
	| SessionTotalRecordHighlight
	| SinceComparisonHighlight
	| SpeciesCountRecordHighlight
	| FirstEverSpeciesHighlight
	| FirstOfYearSpeciesHighlight
	| RareSpeciesHighlight
	| LongAbsenceRetrapHighlight
	| WeightRecordHighlight
	| CombinedSessionTotalRecordHighlight
	| CombinedOnlyOfYearHighlight
	| CombinedFirstEverHighlight
	| CombinedFirstOfYearHighlight
	| CombinedSpeciesCountRecordHighlight;

type DayTotals = {
	date: string;
	encounters: number;
	species: number;
};

// Highlights compare the session against every other session in scope,
// whenever it happened — later data can erase or demote a record
export function buildDayTotals({
	daySpeciesStats,
	sessionDates
}: SessionStatsData): DayTotals[] {
	const totalsByDate = new Map<string, DayTotals>();
	for (const date of sessionDates) {
		totalsByDate.set(date, { date, encounters: 0, species: 0 });
	}
	for (const row of daySpeciesStats) {
		const dayTotals = totalsByDate.get(row.visit_date) ?? {
			date: row.visit_date,
			encounters: 0,
			species: 0
		};
		dayTotals.encounters += row.encounter_count;
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
		case 'this-year': {
			const yearPrefix = `${sessionDate.getFullYear()}-`;
			return (date) => date.startsWith(yearPrefix);
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
			const baseHighlight = {
				type: 'session-total-record',
				sortValue: scopedSortValue(scope, metric === 'encounters' ? 3 : 2),
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
			sortValue: TRAILING_SORT_VALUES['since-comparison'],
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
				sortValue: TRAILING_SORT_VALUES['since-comparison'],
				kind: 'quietest',
				value: sessionValue
			});
		}
	} else if (isOverAMonthBefore(quietestSinceDate)) {
		candidates.push({
			type: 'since-comparison',
			sortValue: TRAILING_SORT_VALUES['since-comparison'],
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

// 2nd/3rd placements are only reported while the top tiers are sparsely
// held: 2nd place needs fewer than three other days at the top value, 3rd
// place needs fewer than three other days across the top two values. The
// session must also equal or exceed an included tier value — a count below
// every other value is not a placement, however thin the history.
//
// A 2nd place may be joint (tying other days is still notable, however many
// days share the value), but a 3rd place is only reported when it is unique —
// a joint 3rd merely repeats an already-lesser record and isn't worth a line.
type Placement = { placementRank: 1 | 2 | 3; isJointPlacement: boolean };

// Turns a count of strictly-better other days into a placement. Ties share a
// rank (they're the same value). A joint 3rd is suppressed — it merely repeats
// an already-lesser record; joint 1st/2nd stay. Returns null outside the top 3.
function resolvePlacement(
	betterDaysCount: number,
	isJointPlacement: boolean
): Placement | null {
	const placementRank = betterDaysCount + 1;
	if (placementRank > 3) return null;
	if (placementRank === 3 && isJointPlacement) return null;
	return { placementRank: placementRank as 1 | 2 | 3, isJointPlacement };
}

function deriveAllTimePlacement(
	sessionValue: number,
	otherValues: number[]
): Placement | null {
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
	// The tier rule above means at most two other days can outrank a qualifying
	// value, so resolvePlacement always yields a 2nd or 3rd here (never 1st)
	const betterDays = otherValues.filter(
		(otherValue) => otherValue > sessionValue
	).length;
	return resolvePlacement(betterDays, otherValues.includes(sessionValue));
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
	const sessionRows = stats.daySpeciesStats.filter(
		(row) => row.visit_date === date
	);
	if (sessionRows.length === 0) return [];

	const sharedFields = {
		year: sessionDate.getFullYear(),
		isCurrentYear: sessionDate.getFullYear() === today.getFullYear()
	};

	const highlights: SpeciesCountRecordHighlight[] = [];
	for (const sessionRow of sessionRows) {
		const { species_name: speciesName, encounter_count: sessionValue } =
			sessionRow;
		// A single bird is never a notable count, whatever the history says
		if (sessionValue === 1) continue;
		for (const scope of RECORD_SCOPES) {
			const scopeMatcher = getScopeMatcher(scope, sessionDate);
			const otherRowsInScope = stats.daySpeciesStats.filter(
				(row) =>
					row.species_name === speciesName &&
					row.visit_date !== date &&
					scopeMatcher(row.visit_date)
			);
			// A record requires the species to appear on at least one other day
			// in scope (otherwise it's first-ever territory, covered by #317)
			if (otherRowsInScope.length === 0) continue;
			const bestOtherValue = Math.max(
				...otherRowsInScope.map((row) => row.encounter_count)
			);
			const baseHighlight = {
				type: 'species-count-record',
				sortValue: scopedSortValue(scope, 1),
				speciesName,
				scope,
				value: sessionValue,
				...sharedFields
			} satisfies SpeciesCountRecordHighlight;
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
							row.encounter_count === bestOtherValue && row.visit_date < date
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
					otherRowsInScope.map((row) => row.encounter_count)
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
	const sessionRows = stats.daySpeciesStats.filter(
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
				!stats.daySpeciesStats.some(
					(row) =>
						row.species_name === sessionRow.species_name &&
						row.visit_date < date
				)
		)
		.map((sessionRow) => {
			// The species' only records ever — later days revoke this, so a
			// "first ever" can lose its "only" copy as more data arrives
			const isOnlyRecord = !stats.daySpeciesStats.some(
				(row) =>
					row.species_name === sessionRow.species_name &&
					row.visit_date !== date
			);
			return {
				type: 'first-ever-species' as const,
				// An "only ever" record heads the list, above a plain first-ever
				sortValue: isOnlyRecord
					? LEADING_SORT_VALUES['only-ever-species']
					: LEADING_SORT_VALUES['first-ever-species'],
				speciesName: sessionRow.species_name,
				multipleIndividualsRecorded: sessionRow.encounter_count > 1,
				isOnlyRecord
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
	const sessionRows = stats.daySpeciesStats.filter(
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
			const priorDates = stats.daySpeciesStats
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
		.map((sessionRow) => ({
			type: 'first-of-year-species' as const,
			sortValue: TRAILING_SORT_VALUES['first-of-year-species'],
			speciesName: sessionRow.species_name,
			year,
			isCurrentYear: year === today.getFullYear(),
			multipleIndividualsRecorded: sessionRow.encounter_count > 1,
			// The species' only records this calendar year — a later day in the
			// same year revokes this; prior-year records don't (they're what
			// makes it first-of-year rather than first-ever)
			isOnlyRecord: !stats.daySpeciesStats.some(
				(row) =>
					row.species_name === sessionRow.species_name &&
					row.visit_date !== date &&
					row.visit_date.startsWith(yearPrefix)
			)
		}));
}

// Returns a highlight for each species in the session that the group has ever
// recorded on only a handful of session days (MAX_RARE_SPECIES_SESSION_DAYS or
// fewer, counting every day it appears before or after this session). A
// species seen for the first time this session is excluded — the first-ever
// highlight already covers it with more specific copy.
export function deriveRareSpecies({
	date,
	stats
}: {
	date: string;
	stats: SessionStatsData;
}): RareSpeciesHighlight[] {
	const sessionRows = stats.daySpeciesStats.filter(
		(row) => row.visit_date === date
	);
	if (sessionRows.length === 0) return [];

	return sessionRows
		.map((sessionRow) => {
			const speciesDays = new Set(
				stats.daySpeciesStats
					.filter((row) => row.species_name === sessionRow.species_name)
					.map((row) => row.visit_date)
			);
			return { sessionRow, speciesDays };
		})
		.filter(
			({ speciesDays }) =>
				speciesDays.size <= MAX_RARE_SPECIES_SESSION_DAYS &&
				// A species recorded on no earlier day is first-ever territory
				[...speciesDays].some((visitDate) => visitDate < date)
		)
		.map(({ sessionRow, speciesDays }) => ({
			type: 'rare-species' as const,
			sortValue: LEADING_SORT_VALUES['rare-species'],
			speciesName: sessionRow.species_name,
			totalSessionDays: speciesDays.size
		}));
}

// Maps RPC rows to LongAbsenceRetrapHighlights, preserving the gap-descending
// order returned by the RPC. The session date is needed to compute the
// years+months gap relative to the day the bird was last seen.
export function deriveLongAbsenceRetraps(
	results: LongAbsenceRetrapsResult[],
	sessionDate: string
): LongAbsenceRetrapHighlight[] {
	const sessionDateObj = new Date(sessionDate);
	return results.map((result) => {
		const previousDateObj = new Date(result.previous_date);
		const duration = intervalToDuration({
			start: previousDateObj,
			end: sessionDateObj
		});
		// intervalToDuration gives years+months+days+etc; we only want years and months
		const gapYears = duration.years ?? 0;
		const gapMonths = duration.months ?? 0;
		return {
			type: 'long-absence-retrap',
			sortValue: LEADING_SORT_VALUES['long-absence-retrap'],
			ringNo: result.ring_no,
			speciesName: result.species_name,
			previousDate: result.previous_date,
			gapYears,
			gapMonths
		};
	});
}

// Minimum number of weighed encounters across other days for a species
// before a weight placement is worth reporting
const MIN_WEIGHED_ENCOUNTERS_FOR_RECORD = 3;

// Ranks the session's extreme against every other day's extreme (heaviest =
// larger is better, lightest = smaller is better). Returns null when the
// session doesn't make the top 3. The rank counts how many other days hold a
// strictly better extreme, so ties share a rank. A joint 3rd is suppressed —
// it merely repeats a lesser record; joint 1st/2nd are still worth reporting.
function deriveWeightPlacement(
	sessionWeight: number,
	otherWeights: number[],
	isHeaviest: boolean
): Placement | null {
	const isBetter = (candidate: number, reference: number) =>
		isHeaviest ? candidate > reference : candidate < reference;
	const betterDays = otherWeights.filter((weight) =>
		isBetter(weight, sessionWeight)
	).length;
	return resolvePlacement(betterDays, otherWeights.includes(sessionWeight));
}

// Weight placements are inherently all-time — a species' heaviest/lightest bird
// this session is ranked against every other day it was weighed, including
// later days (which can demote a placement). A placement needs the species to
// have been weighed at least three times across those other days.
export function deriveWeightRecordBreakers({
	date,
	stats
}: {
	date: string;
	stats: SessionStatsData;
}): WeightRecordHighlight[] {
	const sessionRows = stats.daySpeciesStats.filter(
		(row) => row.visit_date === date && row.weighed_birds_count > 0
	);
	if (sessionRows.length === 0) return [];

	const highlights: WeightRecordHighlight[] = [];
	for (const sessionRow of sessionRows) {
		const otherWeighedRows = stats.daySpeciesStats.filter(
			(row) =>
				row.species_name === sessionRow.species_name &&
				row.visit_date !== date &&
				row.weighed_birds_count > 0
		);
		const otherWeighedEncounters = otherWeighedRows.reduce(
			(total, row) => total + row.weighed_birds_count,
			0
		);
		if (otherWeighedEncounters < MIN_WEIGHED_ENCOUNTERS_FOR_RECORD) continue;

		for (const extreme of WEIGHT_RECORD_EXTREMES) {
			const isHeaviest = extreme === 'heaviest';
			const sessionWeight = isHeaviest
				? sessionRow.max_weight
				: sessionRow.min_weight;
			const otherWeights = otherWeighedRows.map((row) =>
				isHeaviest ? row.max_weight : row.min_weight
			);
			const placement = deriveWeightPlacement(
				sessionWeight,
				otherWeights,
				isHeaviest
			);
			if (placement) {
				highlights.push({
					type: 'weight-record',
					sortValue: TRAILING_SORT_VALUES['weight-record'],
					speciesName: sessionRow.species_name,
					extreme,
					weight: sessionWeight,
					...placement
				});
			}
		}
	}
	return highlights;
}
