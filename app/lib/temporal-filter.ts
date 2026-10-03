// Shared vocabulary for the `{year, month, fromDate, toDate}` temporal filter
// (#1051). `TemporalFilterControls`
// (`app/components/shared/TemporalFilterControls.tsx`) is the UI over it; the
// pure derivation below lives here so later data-layer work (RPC params, a
// Supabase query wrapper) can reuse the same type and intersection rule rather
// than re-deriving it.

// 1-indexed month -> full month name, matching the `month_filter` RPC param's
// 1-indexing (see `app/lib/squashed-month.ts`).
export const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
] as const;

export type TemporalSelection = {
	year?: number;
	month?: number;
	fromDate?: string;
	toDate?: string;
};

// A pair of inclusive `YYYY-MM-DD` bounds. Either side may be absent, meaning
// "unbounded in that direction".
export type EffectiveDateRange = {
	fromDate?: string;
	toDate?: string;
};

function padToTwoDigits(value: number): string {
	return String(value).padStart(2, '0');
}

function getLastDayOfMonth(year: number, month: number): number {
	// Day 0 of the *next* month is the last day of this one. UTC throughout so
	// the result never shifts with the runner's timezone.
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// The date range a year/month selection implies on its own. A month with no
// year recurs in every year, so it has no contiguous bounds at all (the same
// "squashed month" idea as `/summary/jan`) — it contributes nothing to the
// range and is applied as a separate recurring filter downstream.
export function deriveYearMonthDateRange({
	year,
	month
}: TemporalSelection): EffectiveDateRange {
	if (!year) {
		return {};
	}
	if (!month) {
		return { fromDate: `${year}-01-01`, toDate: `${year}-12-31` };
	}
	const paddedMonth = padToTwoDigits(month);
	const lastDay = padToTwoDigits(getLastDayOfMonth(year, month));
	return {
		fromDate: `${year}-${paddedMonth}-01`,
		toDate: `${year}-${paddedMonth}-${lastDay}`
	};
}

// `YYYY-MM-DD` strings order lexicographically, so plain string comparison is
// enough to intersect two ranges — no Date parsing needed.
function latestBound(...bounds: (string | undefined)[]): string | undefined {
	return bounds
		.filter((bound) => !!bound)
		.sort()
		.at(-1);
}

function earliestBound(...bounds: (string | undefined)[]): string | undefined {
	return bounds
		.filter((bound) => !!bound)
		.sort()
		.at(0);
}

// The always-computed intersection of the year/month-derived range with the
// explicit fromDate/toDate — never an either/or choice between the two modes.
// An intersection can come out empty (fromDate after toDate); that's exactly
// the misalignment `TemporalFilterControls`' conflict warning flags, so it's
// returned as-is rather than silently normalised away.
export function computeEffectiveDateRange(
	selection: TemporalSelection
): EffectiveDateRange {
	const derived = deriveYearMonthDateRange(selection);
	const fromDate = latestBound(derived.fromDate, selection.fromDate);
	const toDate = earliestBound(derived.toDate, selection.toDate);
	return {
		...(fromDate ? { fromDate } : {}),
		...(toDate ? { toDate } : {})
	};
}

// Query-string form of a selection: only the fields actually set appear.
export function buildTemporalQueryStrings({
	year,
	month,
	fromDate,
	toDate
}: TemporalSelection): Record<string, string> {
	return {
		...(year ? { year: String(year) } : {}),
		...(month ? { month: String(month) } : {}),
		...(fromDate ? { fromDate } : {}),
		...(toDate ? { toDate } : {})
	};
}

export function buildTemporalHref(
	path: string,
	queryStrings: Record<string, string>
): string {
	const search = new URLSearchParams(queryStrings).toString();
	return search ? `${path}?${search}` : path;
}
