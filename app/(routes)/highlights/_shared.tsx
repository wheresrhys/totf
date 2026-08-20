import { format } from 'date-fns';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { SessionLinksList } from '@/app/components/SessionLinksList';

export function HighlightsPage({
	year,
	month,
	sessionDates = [],
	viewedGroupId
}: {
	year?: number;
	month?: number;
	sessionDates?: string[];
	viewedGroupId?: number;
}) {
	return (
		<PageWrapper>
			<PrimaryHeading>{buildHeading(year, month)}</PrimaryHeading>
			{viewedGroupId !== undefined && (
				<SessionLinksList
					sessionDates={sessionDates}
					viewedGroupId={viewedGroupId}
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
