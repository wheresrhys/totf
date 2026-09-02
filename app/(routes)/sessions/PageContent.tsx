import { SessionHistoryCalendar } from '@/app/components/SessionHistoryCalendar';
import type { ViewedGroup } from '@/lib/group-slug';
import type { SessionWithEncountersCount } from '@/app/models/session';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';

export function SessionsPageContent({
	data,
	viewedGroup
}: {
	data: SessionWithEncountersCount[];
	viewedGroup: ViewedGroup;
}) {
	return (
		<PageWrapper>
			<PrimaryHeading>Session history</PrimaryHeading>
			<SessionHistoryCalendar sessions={data} viewedGroup={viewedGroup} />
		</PageWrapper>
	);
}
