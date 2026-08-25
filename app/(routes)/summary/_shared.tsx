import { format } from 'date-fns';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { SessionLinksList } from '@/app/components/SessionLinksList';
import { SpeciesTotalsSection } from '@/app/components/SpeciesTotalsSection';
import { type ViewedGroup } from '@/lib/group-slug';
import type { AggregateStatsResult } from '@/app/models/db';
export function SummaryPage({
	year,
	month,
	sessionDates = [],
	speciesStats = [],
	viewedGroup
}: {
	year?: number;
	month?: number;
	sessionDates?: string[];
	speciesStats?: AggregateStatsResult[];
	viewedGroup?: ViewedGroup;
}) {
	return (
		<PageWrapper>
			<PrimaryHeading>{buildHeading(year, month)}</PrimaryHeading>
			{viewedGroup !== undefined && (
				<SessionLinksList
					sessionDates={sessionDates}
					viewedGroup={viewedGroup}
				/>
			)}
			<SpeciesTotalsSection speciesStats={speciesStats} />
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
