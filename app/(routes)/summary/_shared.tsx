import { format } from 'date-fns';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { SummaryStatsSection } from '@/app/components/SummaryStatsSection';
import { HighlightsSection } from '@/app/components/HighlightsSection';
import { SummaryTotalsSection } from '@/app/components/SummaryTotalsSection';
import type { AggregateStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/lib/group-slug';
import type { MonthTotalsRow } from '@/app/models/month-totals';
export function SummaryPage({
	year,
	month,
	summaryStats = null,
	monthTotals,
	yearlyTotals,
	sessionTotals,
	showAllTimeMonthTotals,
	viewedGroup,
	fromDate,
	toDate
}: {
	year?: number;
	month?: number;
	summaryStats?: AggregateStatsResult | null;
	monthTotals?: MonthTotalsRow[];
	yearlyTotals?: AggregateStatsResult[];
	sessionTotals?: AggregateStatsResult[];
	// Only the all-time page sets this — enables the combine-years "Month totals"
	// tab (data fetched lazily on select, not passed in).
	showAllTimeMonthTotals?: boolean;
	viewedGroup?: ViewedGroup;
	// Date bounds for the lazily-fetched Species totals tab — undefined on the
	// all-time page (unscoped species totals).
	fromDate?: string;
	toDate?: string;
}) {
	return (
		<PageWrapper>
			<PrimaryHeading>{buildHeading(year, month)}</PrimaryHeading>
			{year === undefined && (
				<p className="text-sm italic text-base-content/70">
					Note that birds are counted in the youngest age category they were
					recorded in
				</p>
			)}
			<div className="sm:hidden">
				<SummaryStatsSection stats={summaryStats} />
				<HighlightsSection />
			</div>
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
			/>
		</PageWrapper>
	);
}

function buildHeading(year?: number, month?: number): string {
	if (year === undefined) {
		return 'All time summary';
	}
	if (month === undefined) {
		return `${year} summary`;
	}
	const monthDate = new Date(year, month - 1, 1);
	return `${format(monthDate, 'LLLL')} ${year} summary`;
}
