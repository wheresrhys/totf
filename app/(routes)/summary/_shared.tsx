import { format } from 'date-fns';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { SessionLinksList } from '@/app/components/SessionLinksList';
import { SummaryStatsSection } from '@/app/components/SummaryStatsSection';
import { type ViewedGroup } from '@/lib/group-slug';
import type { AggregateStatsResult } from '@/app/models/db';
export function SummaryPage({
	year,
	month,
	sessionDates = [],
	summaryStats = null,
	viewedGroup
}: {
	year?: number;
	month?: number;
	sessionDates?: string[];
	summaryStats?: AggregateStatsResult | null;
	viewedGroup?: ViewedGroup;
}) {
	return (
		<PageWrapper>
			<PrimaryHeading>{buildHeading(year, month)}</PrimaryHeading>
			<SummaryStatsSection stats={summaryStats} />
			{viewedGroup !== undefined && (
				<SessionLinksList
					sessionDates={sessionDates}
					viewedGroup={viewedGroup}
				/>
			)}
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
