// `'use client'` (#1113) — `buildSummaryNavigationTarget` below is passed as
// `TemporalFilterControls`' `navigationController` prop. Passing a plain
// function value from a Server Component into a Client Component's props
// throws at runtime ("Functions cannot be passed directly to Client
// Components..."), since RSC serialization can't carry a function across that
// boundary — it only type-checks and unit-tests fine, same silent-until-
// production shape as the client-reference pitfall documented in
// `app/CLAUDE.md`'s "Where a page's tab ids _and_ `dataFetcher`s live". Making
// this whole module a Client Component (matching
// `species/[speciesName]/PageContent.tsx`'s existing convention) means the
// closure is constructed and consumed entirely client-side and never crosses
// the boundary at all.
'use client';
import { format } from 'date-fns';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { SummaryStatsSection } from '@/app/components/SummaryStatsSection';
import { HighlightsSection } from '@/app/components/HighlightsSection';
import { SummaryTotalsSection } from '@/app/components/SummaryTotalsSection';
import { SquashedMonthSummaryTotalsSection } from '@/app/components/SquashedMonthSummaryTotalsSection';
import {
	TemporalFilterControls,
	type TemporalNavigationTarget
} from '@/app/components/shared/TemporalFilterControls';
import type { TemporalSelection } from '@/app/lib/temporal-filter';
import { formatMonthAbbreviation } from '@/app/lib/squashed-month';
import type { CoreStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { SpeciesStatsRow } from '@/app/lib/species-stats';
import { formatMonthLabel, type MonthTotalsRow } from '@/app/lib/month-totals';

// Maps a `TemporalFilterControls` selection onto this page's existing
// year/month path-param routing (`/summary`, `/summary/{year}`,
// `/summary/{year}/{month}`) or its squashed-month sibling (`/summary/{monthAbbrev}`)
// when a month is picked with no year — the same "recurring month" case that
// route already exists for (#1005). Only `fromDate`/`toDate` ever become query
// strings; year/month always resolve to a path segment.
//
// `fromDate`/`toDate` are carried through as query strings on every route
// depth so a selection isn't silently dropped, but only the all-time
// `/summary` page's own data-fetcher currently applies them (#1076) — the
// year/month-scoped sub-routes already derive their own date bounds from the
// path and don't yet support a further explicit narrowing on top. Revisit
// once that's asked for.
function buildSummaryNavigationTarget(
	selection: TemporalSelection
): TemporalNavigationTarget {
	const { year, month, fromDate, toDate } = selection;
	const queryStrings: Record<string, string> = {
		...(fromDate ? { fromDate } : {}),
		...(toDate ? { toDate } : {})
	};
	if (year !== undefined) {
		const yearPath = `/summary/${year}`;
		return {
			path: month !== undefined ? `${yearPath}/${month}` : yearPath,
			queryStrings
		};
	}
	if (month !== undefined) {
		return { path: `/summary/${formatMonthAbbreviation(month)}`, queryStrings };
	}
	return { path: '/summary', queryStrings };
}

function buildHeading(
	year?: number,
	month?: number,
	squashedMonth?: number
): string {
	if (squashedMonth !== undefined) {
		return `${formatMonthLabel({ zeroIndexedMonth: squashedMonth - 1 })} summary`;
	}
	if (year === undefined) {
		return 'All time summary';
	}
	if (month === undefined) {
		return `${year} summary`;
	}
	const monthDate = new Date(year, month - 1, 1);
	return `${format(monthDate, 'LLLL')} ${year} summary`;
}

export function SummaryPageContent({
	year,
	month,
	squashedMonth,
	summaryStats = null,
	monthTotals,
	yearlyTotals,
	sessionTotals,
	showAllTimeMonthTotals,
	speciesTotalsForMonth,
	yearTotalsForMonth,
	sessionTotalsForMonth,
	viewedGroup,
	fromDate,
	toDate,
	years = [],
	initialTabId,
	initialTabData
}: {
	year?: number;
	month?: number;
	// Set only by the `[yearOrMonth]` route's squashed-month branch (#1005) —
	// every occurrence of this calendar month across the group's whole
	// history, rather than a single real year. Mutually exclusive with
	// `year`/`month`.
	squashedMonth?: number;
	summaryStats?: CoreStatsResult | null;
	monthTotals?: MonthTotalsRow[];
	yearlyTotals?: CoreStatsResult[];
	sessionTotals?: CoreStatsResult[];
	// Only the all-time page sets this — enables the combine-years "Month totals"
	// tab (data fetched lazily on select, not passed in).
	showAllTimeMonthTotals?: boolean;
	// The squashed-month page's 3 tabs' data — fetched eagerly (cheap, no
	// zero-filling/lazy loading needed), unlike every other tab on this page.
	speciesTotalsForMonth?: SpeciesStatsRow[];
	yearTotalsForMonth?: CoreStatsResult[];
	sessionTotalsForMonth?: CoreStatsResult[];
	viewedGroup?: ViewedGroup;
	// Date bounds for the lazily-fetched Species totals tab — undefined on the
	// all-time page unless the user has picked an explicit range via
	// `TemporalFilterControls` (#1076).
	fromDate?: string;
	toDate?: string;
	// The years `TemporalFilterControls`' year dropdown offers — every route
	// depth fetches the same group-wide list (`fetchYears`,
	// `app/(routes)/species/page.tsx`) so the control looks identical however
	// deep the user is.
	years?: number[];
	// The resolved `?tabId=` search param (#804, reusing #803's mechanism) —
	// passed straight through to `SummaryTotalsSection`, which resolves it
	// against its own per-render `tabs` array.
	initialTabId?: string;
	// The active tab's server-prefetched data (#1072/#1068's
	// `prefetchActiveTabData` wiring), passed straight through to whichever
	// totals section this branch renders.
	initialTabData?: { tabId: string; data: unknown };
}) {
	const initialSelection: TemporalSelection =
		squashedMonth !== undefined ? { month: squashedMonth } : { year, month };
	return (
		<PageWrapper>
			<PrimaryHeading>
				{buildHeading(year, month, squashedMonth)}
			</PrimaryHeading>
			<TemporalFilterControls
				years={years}
				baseUrl="/summary"
				initialSelection={initialSelection}
				navigationController={buildSummaryNavigationTarget}
			/>
			<div className="sm:hidden">
				<SummaryStatsSection stats={summaryStats} />
				<HighlightsSection />
			</div>
			{squashedMonth !== undefined ? (
				<SquashedMonthSummaryTotalsSection
					squashedMonth={squashedMonth}
					summaryStats={summaryStats}
					speciesTotalsForMonth={speciesTotalsForMonth ?? []}
					yearTotalsForMonth={yearTotalsForMonth ?? []}
					sessionTotalsForMonth={sessionTotalsForMonth ?? []}
					viewedGroup={viewedGroup}
					initialTabId={initialTabId}
					initialTabData={initialTabData}
				/>
			) : (
				<SummaryTotalsSection
					summaryStats={summaryStats}
					monthTotals={monthTotals}
					yearlyTotals={yearlyTotals}
					sessionTotals={sessionTotals}
					showAllTimeMonthTotals={showAllTimeMonthTotals}
					viewedGroup={viewedGroup}
					fromDate={fromDate}
					toDate={toDate}
					year={year}
					month={month}
					initialTabId={initialTabId}
					initialTabData={initialTabData}
				/>
			)}
		</PageWrapper>
	);
}
