import { format } from 'date-fns';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { SummaryStatsSection } from '@/app/components/SummaryStatsSection';
import { HighlightsSection } from '@/app/components/HighlightsSection';
import { SpeciesTotalsSection } from '@/app/components/SpeciesTotalsSection';
import { type ViewedGroup } from '@/lib/group-slug';
import type { AggregateStatsResult } from '@/app/models/db';
export function SummaryPage({
	year,
	month,
	summaryStats = null,
	speciesStats = []
}: {
	year?: number;
	month?: number;
	sessionDates?: string[];
	summaryStats?: AggregateStatsResult | null;
	speciesStats?: AggregateStatsResult[];
	viewedGroup?: ViewedGroup;
}) {
	return (
		<PageWrapper>
			<PrimaryHeading>{buildHeading(year, month)}</PrimaryHeading>
			<div className="lg:flex lg:items-start lg:gap-8">
				<div className="lg:w-[400px] lg:shrink-0">
					<SummaryStatsSection stats={summaryStats} />
					<HighlightsSection />
				</div>
				<div className="lg:flex-1">
					<SpeciesTotalsSection speciesStats={speciesStats} />
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
