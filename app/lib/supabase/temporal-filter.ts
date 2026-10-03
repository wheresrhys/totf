import {
	endOfMonth,
	endOfYear,
	format,
	startOfMonth,
	startOfYear
} from 'date-fns';

/**
 * The four temporal filters #1051 standardises on, in the shape the UI
 * (`TemporalFilterControls`, #1073) and the stats RPC family
 * (`from_date`/`to_date`/`year_filter`/`month_filter`) both express them.
 * `month` is 1-indexed, matching `month_filter` and `app/lib/squashed-month.ts`.
 * All four are optional and all are intersected — an all-time query passes
 * none.
 */
export type TemporalFilter = {
	year?: number;
	/** 1-indexed calendar month. Only meaningful alongside `year` — see `applyTemporalFilter`. */
	month?: number;
	/** Inclusive lower bound, `yyyy-MM-dd`. */
	fromDate?: string;
	/** Inclusive upper bound, `yyyy-MM-dd`. */
	toDate?: string;
};

type InclusiveDateRange = { fromDate?: string; toDate?: string };

const ISO_DATE_FORMAT = 'yyyy-MM-dd';

/**
 * Encounters carry their own `visit_date` (#1015) rather than reaching it
 * through the `Sessions` embed, so a temporal filter on an `Encounters`-rooted
 * query is a plain column filter — and stays correct once resighting
 * encounters stop linking to a `Session` row at all (#1024). The same reason
 * `queries/Encounters/*` select `visit_date` directly.
 */
const ENCOUNTER_VISIT_DATE_COLUMN = 'visit_date';

/**
 * The slice of a supabase-js `PostgrestFilterBuilder` this helper needs. It's
 * structural, and generic over the builder itself, so any `Encounters`-rooted
 * query can be passed regardless of its `.select()` shape and the *same* type
 * comes back — leaving the caller free to go on chaining `.order()`/`.range()`,
 * which this helper deliberately never touches.
 */
type DateBoundedQuery<Query> = {
	gte(column: string, value: string): Query;
	lte(column: string, value: string): Query;
};

// `yyyy-MM-dd` strings sort lexicographically in date order, so intersecting
// two ranges is plain string max/min — no parsing round-trip needed.
function laterDateBound(
	first: string | undefined,
	second: string | undefined
): string | undefined {
	if (first === undefined || second === undefined) {
		return first ?? second;
	}
	return first > second ? first : second;
}

function earlierDateBound(
	first: string | undefined,
	second: string | undefined
): string | undefined {
	if (first === undefined || second === undefined) {
		return first ?? second;
	}
	return first < second ? first : second;
}

// The calendar bounds `year` (and optionally `month`) stands for: the whole
// year, or the single month within it.
function deriveYearMonthDateRange(
	year: number,
	month: number | undefined
): InclusiveDateRange {
	if (month === undefined) {
		const yearStart = startOfYear(new Date(year, 0, 1));
		return {
			fromDate: format(yearStart, ISO_DATE_FORMAT),
			toDate: format(endOfYear(yearStart), ISO_DATE_FORMAT)
		};
	}
	const monthStart = startOfMonth(new Date(year, month - 1, 1));
	return {
		fromDate: format(monthStart, ISO_DATE_FORMAT),
		toDate: format(endOfMonth(monthStart), ISO_DATE_FORMAT)
	};
}

function resolveTemporalDateRange({
	year,
	month,
	fromDate,
	toDate
}: TemporalFilter): InclusiveDateRange {
	if (year === undefined) {
		if (month !== undefined) {
			// A bare `month` is the "squashed month" filter (every March the group
			// has ever rung) — not a contiguous range, so PostgREST can't express
			// it as column bounds the way the RPC family's
			// `EXTRACT(MONTH FROM visit_date) = month_filter` can. Fail loudly
			// rather than silently widening the query to all time.
			throw new Error(
				'applyTemporalFilter cannot apply `month` without `year`: a squashed-month filter is not a contiguous date range, so it must go through the stats RPC family (`month_filter`) instead.'
			);
		}
		return { fromDate, toDate };
	}
	const yearMonthRange = deriveYearMonthDateRange(year, month);
	return {
		fromDate: laterDateBound(fromDate, yearMonthRange.fromDate),
		toDate: earlierDateBound(toDate, yearMonthRange.toDate)
	};
}

/**
 * Applies `{fromDate, toDate, year, month}` to an `Encounters`-rooted
 * supabase-js query as inclusive `visit_date` bounds, intersecting all four the
 * same way the stats RPC family AND's `from_date`/`to_date` with the
 * `year_filter`/`month_filter` conditions.
 *
 * It only ever adds `WHERE`-equivalent conditions — never `.range()`,
 * `.order()`, `.select()` or anything else a caller (or
 * `fetchAllPaginatedRows`, `lib/supabase.ts`) owns — so it composes inside a
 * paging callback:
 *
 * ```ts
 * fetchAllPaginatedRows((fromRow, toRow) =>
 *   applyTemporalFilter(supabase.from('Encounters').select('*'), filter)
 *     .order('id')
 *     .range(fromRow, toRow)
 * );
 * ```
 *
 * Throws if `month` is supplied without `year` (see `resolveTemporalDateRange`).
 */
export function applyTemporalFilter<Query extends DateBoundedQuery<Query>>(
	query: Query,
	filter: TemporalFilter
): Query {
	const { fromDate, toDate } = resolveTemporalDateRange(filter);
	let filteredQuery = query;
	if (fromDate !== undefined) {
		filteredQuery = filteredQuery.gte(ENCOUNTER_VISIT_DATE_COLUMN, fromDate);
	}
	if (toDate !== undefined) {
		filteredQuery = filteredQuery.lte(ENCOUNTER_VISIT_DATE_COLUMN, toDate);
	}
	return filteredQuery;
}
