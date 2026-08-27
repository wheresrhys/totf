import { format } from 'date-fns';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { SummaryStatsSection } from '@/app/components/SummaryStatsSection';
import { HighlightsSection } from '@/app/components/HighlightsSection';
import { SpeciesTotalsSection } from '@/app/components/SpeciesTotalsSection';
import type { AggregateStatsResult } from '@/app/models/db';
import type { MonthTotalsRow } from '@/app/models/month-totals';
export function SummaryPage({
	year,
	month,
	summaryStats = null,
	speciesStats = [],
	monthTotals
}: {
	year?: number;
	month?: number;
	summaryStats?: AggregateStatsResult | null;
	speciesStats?: AggregateStatsResult[];
	monthTotals?: MonthTotalsRow[];
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
			<div className="lg:flex lg:items-start lg:gap-8">
				<div className="lg:w-[400px] lg:shrink-0">
					<SummaryStatsSection stats={summaryStats} />
					<HighlightsSection />
				</div>
				<div className="lg:flex-1">
					<SpeciesTotalsSection
						speciesStats={speciesStats}
						monthTotals={monthTotals}
					/>
				</div>
			</div>
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
