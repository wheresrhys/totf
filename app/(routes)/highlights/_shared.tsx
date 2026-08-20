import { format } from 'date-fns';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { SessionLinksList } from '@/app/components/SessionLinksList';
import { type ViewedGroup } from '@/lib/group-slug';
export function HighlightsPage({
	year,
	month,
	sessionDates = [],
	viewedGroup
}: {
	year?: number;
	month?: number;
	sessionDates?: string[];
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
		</PageWrapper>
	);
}

function buildHeading(year?: number, month?: number): string {
	if (year === undefined) {
		return 'All time highlights';
	}
	if (month === undefined) {
		return `${year} highlights`;
	}
	const monthDate = new Date(year, month - 1, 1);
	return `${format(monthDate, 'LLLL')} ${year} highlights`;
}
