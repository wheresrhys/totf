import { format as formatDate } from 'date-fns';
import {
	temporalUnitNameMapping,
	type StatsTemporalUnit
} from '@/app/models/temporal-unit';
import type { FetchStatsCacheDiscrepanciesResult } from '@/app/actions/stats-cache-discrepancies';

/**
 * One of the 10 cells #1387's discrepancy report walks: the 5
 * `StatsTemporalUnit` values, each checked once combined and once by
 * species (#1374's "Then same again but by species").
 */
export type DiscrepancyScope = {
	temporalUnit: StatsTemporalUnit;
	bySpecies: boolean;
};

// Coarsest-first order #1374 specified — `all-time` → `year` →
// `month-squashed` → `month` → `day` (`day` being this app's Session unit).
const TEMPORAL_UNIT_ORDER: StatsTemporalUnit[] = [
	'all-time',
	'year',
	'month-squashed',
	'month',
	'day'
];

/**
 * All 10 scopes, in rendering order: the combined pass over the 5 temporal
 * units, then the same 5 again by species — not interleaved per unit.
 */
export const DISCREPANCY_SCOPES: DiscrepancyScope[] = [
	...TEMPORAL_UNIT_ORDER.map(
		(temporalUnit): DiscrepancyScope => ({ temporalUnit, bySpecies: false })
	),
	...TEMPORAL_UNIT_ORDER.map(
		(temporalUnit): DiscrepancyScope => ({ temporalUnit, bySpecies: true })
	)
];

// `all-time`/`year`/`month-squashed` are bounded independent of a group's
// session-history length (see #1387's acceptance criteria), so the page's
// own data fetcher runs them eagerly. `month`/`day` scale with a group's
// history and render a "Run check" trigger instead.
const EAGER_TEMPORAL_UNITS: ReadonlySet<StatsTemporalUnit> = new Set([
	'all-time',
	'year',
	'month-squashed'
]);

export function isEagerScope(scope: DiscrepancyScope): boolean {
	return EAGER_TEMPORAL_UNITS.has(scope.temporalUnit);
}

/** The 6 scopes (3 temporal units × combined/by-species) the page's data fetcher runs eagerly. */
export const EAGER_DISCREPANCY_SCOPES: DiscrepancyScope[] =
	DISCREPANCY_SCOPES.filter(isEagerScope);

/** Stable string key for one scope — used both as a React list key and to index `DiscrepancyScopeResults`. */
export function discrepancyScopeKey(scope: DiscrepancyScope): string {
	return `${scope.temporalUnit}:${scope.bySpecies ? 'by-species' : 'combined'}`;
}

/** The eager half of the report's data, keyed by `discrepancyScopeKey`. */
export type DiscrepancyScopeResults = Record<
	string,
	FetchStatsCacheDiscrepanciesResult
>;

export function discrepancyScopeHeading(scope: DiscrepancyScope): string {
	const unitLabel = temporalUnitNameMapping[scope.temporalUnit];
	return scope.bySpecies ? `${unitLabel} (by species)` : unitLabel;
}

/**
 * `time_period` parsed into local-time components via its own `-`-split
 * string rather than `new Date(isoString)` — sidesteps the UTC-parse
 * off-by-one `new Date("2026-01-01")` risks at the Jan/Dec boundary on
 * negative-offset runtimes, the same reason `formatMonthYearLabel`
 * (`app/lib/month-totals.ts`) builds its `Date` from numeric parts.
 */
function parsePeriodParts(timePeriod: string): {
	year: number;
	month: number;
	day: number;
} {
	const [year, month, day] = timePeriod.split('-').map(Number);
	return { year, month, day };
}

/** `null` for `all-time`, whose cells carry no period at all. */
function formatDiscrepancyPeriod(
	temporalUnit: StatsTemporalUnit,
	timePeriod: string | null
): string | null {
	if (timePeriod === null) {
		return null;
	}
	const { year, month, day } = parsePeriodParts(timePeriod);
	switch (temporalUnit) {
		case 'year':
			return formatDate(new Date(year, 0, 1), 'yyyy');
		case 'month':
			return formatDate(new Date(year, month - 1, 1), 'MMMM yyyy');
		case 'month-squashed':
			// Spans every year's copy of this calendar month — year-free label.
			return formatDate(new Date(2000, month - 1, 1), 'MMMM');
		case 'day':
			return formatDate(new Date(year, month - 1, day), 'd MMMM yyyy');
		case 'all-time':
			return null;
	}
}

/**
 * One discrepant cell's list-item label, per #1374's example —
 * "discrepancies found for month stats January 2026" — with a
 * "for species <name>" suffix only on a by-species scope's items. Falls
 * back to a literal `species #<id>` if the id isn't in `speciesNamesById`
 * (shouldn't happen in practice — every discrepancy's species is one of
 * the viewed group's own — but keeps the label meaningful rather than
 * blank if it ever does).
 */
export function discrepancyItemLabel(
	scope: DiscrepancyScope,
	timePeriod: string | null,
	speciesId: number | null,
	speciesNamesById: Record<number, string>
): string {
	const unitLabel = temporalUnitNameMapping[scope.temporalUnit];
	const formattedPeriod = formatDiscrepancyPeriod(
		scope.temporalUnit,
		timePeriod
	);
	const base = formattedPeriod
		? `discrepancies found for ${unitLabel} stats ${formattedPeriod}`
		: `discrepancies found for ${unitLabel} stats`;
	if (!scope.bySpecies || speciesId === null) {
		return base;
	}
	const speciesName = speciesNamesById[speciesId] ?? `species #${speciesId}`;
	return `${base} for species ${speciesName}`;
}
