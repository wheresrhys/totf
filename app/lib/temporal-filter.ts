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
//
// `recurringMonth` (1-indexed) is set when a month is selected with no year. In
// that case the bounds are only an *outer envelope*: the selection is that
// month's recurrence inside them — one disjoint window per year spanned, not
// one contiguous run of dates. So a consumer must apply `recurringMonth` as a
// filter of its own alongside the bounds; treating `{fromDate, toDate}` as the
// whole selection would wrongly include the other eleven months of every year
// in between. The field lives on the returned value rather than only in a
// comment so that's impossible to miss at the call site.
export type EffectiveDateRange = {
	fromDate?: string;
	toDate?: string;
	recurringMonth?: number;
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
// bounds and comes back as `recurringMonth` for the caller to apply separately.
export function deriveYearMonthDateRange({
	year,
	month
}: TemporalSelection): EffectiveDateRange {
	if (!year) {
		return month ? { recurringMonth: month } : {};
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

// Whether a recurring (yearless) month falls inside the bounds at least once.
// With either bound absent the recurrence is unbounded in that direction, so
// it always does. With both set, only the years the bounds span can contain an
// occurrence, and each year's window has to actually overlap them — e.g. May
// with 2021-06-01..2022-03-31 spans two years yet contains no May at all.
function monthRecursWithinBounds(
	month: number,
	fromDate?: string,
	toDate?: string
): boolean {
	if (!fromDate || !toDate) {
		return true;
	}
	const paddedMonth = padToTwoDigits(month);
	const firstYearSpanned = parseInt(fromDate.slice(0, 4));
	const lastYearSpanned = parseInt(toDate.slice(0, 4));
	for (let year = firstYearSpanned; year <= lastYearSpanned; year++) {
		const lastDay = padToTwoDigits(getLastDayOfMonth(year, month));
		const monthStart = `${year}-${paddedMonth}-01`;
		const monthEnd = `${year}-${paddedMonth}-${lastDay}`;
		if (monthStart <= toDate && monthEnd >= fromDate) {
			return true;
		}
	}
	return false;
}

// The always-computed intersection of the year/month-derived range with the
// explicit fromDate/toDate — never an either/or choice between the two modes.
//
// Returns `null` when nothing at all satisfies the whole selection, so an
// unsatisfiable combination can't be mistaken for a range that merely happens
// to be narrow. Two ways that happens: the intersection inverts (`fromDate`
// after `toDate` — e.g. year 2022 with an explicit 2023-01-01 onwards), or a
// recurring month never occurs inside the bounds at all (May within
// 2021-06-01..2022-03-31). Callers decide how to present "no dates"; this
// function won't hand back an empty-but-present range for them to misread.
//
// A month selected with no year makes the result non-contiguous — e.g. May
// plus 2021-01-01..2023-12-31 means three separate Mays, not three unbroken
// years — so the bounds come back as the envelope around those windows and the
// month comes back as `recurringMonth` for the caller to apply as well. The
// envelope is deliberately not narrowed to the first/last occurrence of the
// month: nothing downstream needs tighter bounds while `recurringMonth` is
// being applied anyway, and widening later would be a behaviour change where
// narrowing it now would not.
export function computeEffectiveDateRange(
	selection: TemporalSelection
): EffectiveDateRange | null {
	const derived = deriveYearMonthDateRange(selection);
	const fromDate = latestBound(derived.fromDate, selection.fromDate);
	const toDate = earliestBound(derived.toDate, selection.toDate);
	if (fromDate && toDate && fromDate > toDate) {
		return null;
	}
	if (
		derived.recurringMonth &&
		!monthRecursWithinBounds(derived.recurringMonth, fromDate, toDate)
	) {
		return null;
	}
	return {
		...(fromDate ? { fromDate } : {}),
		...(toDate ? { toDate } : {}),
		...(derived.recurringMonth
			? { recurringMonth: derived.recurringMonth }
			: {})
	};
}

// A month selected with no year is a recurring selection rather than a single
// window (see `deriveYearMonthDateRange`). A caller whose data model can't
// express that — a page keyed on one concrete year, say — opts out by treating
// the combination as invalid instead, via `TemporalFilterControls`'
// `treatMonthWithoutYearAsInvalid` prop.
export function isMonthSelectedWithoutYear({
	year,
	month
}: TemporalSelection): boolean {
	return !!month && !year;
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
