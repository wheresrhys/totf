import { format } from 'date-fns';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { SummaryStatsSection } from '@/app/components/SummaryStatsSection';
import { HighlightsSection } from '@/app/components/HighlightsSection';
import { SummaryTotalsSection } from '@/app/components/SummaryTotalsSection';
import { SquashedMonthSummaryTotalsSection } from '@/app/components/SquashedMonthSummaryTotalsSection';
import type { CoreStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { SpeciesStatsRow } from '@/app/lib/species-stats';
import { formatMonthLabel, type MonthTotalsRow } from '@/app/lib/month-totals';

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
	// all-time page (unscoped species totals).
	fromDate?: string;
	toDate?: string;
	// The resolved `?tabId=` search param (#804, reusing #803's mechanism) —
	// passed straight through to `SummaryTotalsSection`, which resolves it
	// against its own per-render `tabs` array.
	initialTabId?: string;
	// The one migrated tab's server-prefetched data (#1072's
	// `prefetchActiveTabData` wiring), passed straight through to
	// `SummaryTotalsSection`. `undefined` on the squashed-month branch, which
	// has no migrated tabs of its own.
	initialTabData?: { tabId: string; data: unknown };
}) {
	return (
		<PageWrapper>
			<PrimaryHeading>
				{buildHeading(year, month, squashedMonth)}
			</PrimaryHeading>
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
