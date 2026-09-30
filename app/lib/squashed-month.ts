import type { ViewedGroup } from './group-slug';

// The 12 lowercase 3-letter abbreviations a `[yearOrMonth]` route segment
// accepts as a "squashed month" filter (e.g. `/summary/jan`) instead of a
// real calendar year — index 0 is January, matching `zeroIndexedMonth`
// elsewhere in this codebase (`app/lib/month-totals.ts`).
export const MONTH_ABBREVIATIONS = [
	'jan',
	'feb',
	'mar',
	'apr',
	'may',
	'jun',
	'jul',
	'aug',
	'sep',
	'oct',
	'nov',
	'dec'
] as const;

// Case-insensitive match against the 12 abbreviations above. Returns a
// 1-indexed month (matching `core_stats`' `month_filter` RPC param) or
// `undefined` for anything else, including a numeric year string — callers
// treat `undefined` as "fall through to the existing numeric-year route
// behaviour".
export function parseMonthAbbreviation(value: string): number | undefined {
	const index = MONTH_ABBREVIATIONS.indexOf(
		value.toLowerCase() as (typeof MONTH_ABBREVIATIONS)[number]
	);
	return index === -1 ? undefined : index + 1;
}

// 1-indexed month -> lowercase abbreviation, for building hrefs into the
// squashed-month routes.
export function formatMonthAbbreviation(month: number): string {
	return MONTH_ABBREVIATIONS[month - 1];
}

// Group-scoped squashed-month summary href, the squashed-month sibling of
// `buildGroupSummaryHref` (`app/lib/group-links.ts`) — same "undefined
// viewedGroup -> ''" convention, matching the "empty href renders as plain
// text" rule `PeriodTotalsTable`/`createNameLinkCell` follow.
export function buildGroupSquashedMonthSummaryHref(
	viewedGroup: ViewedGroup | undefined,
	month: number
): string {
	if (!viewedGroup) {
		return '';
	}
	return `/group/${viewedGroup.slug}/summary/${formatMonthAbbreviation(month)}`;
}

// Ungrouped squashed-month species href — species links never carry the
// group slug (see `SpeciesTotalsTable.buildSpeciesHref`,
// `SpCombinedMonthTotalsTab`'s inline hrefs), since there's no group-scoped
// species route at any depth.
export function buildSpeciesSquashedMonthHref(
	speciesName: string,
	month: number
): string {
	return `/species/${speciesName}/${formatMonthAbbreviation(month)}`;
}
