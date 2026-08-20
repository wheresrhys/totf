import { format as formatDate } from 'date-fns';
import Link from 'next/link';
import { BoxyList } from './shared/DesignSystem';

export function SessionLinksList({
	sessionDates,
	viewedGroupId
}: {
	sessionDates: string[];
	viewedGroupId: number;
}) {
	if (sessionDates.length === 0) {
		return null;
	}

	return (
		<BoxyList>
			{sessionDates.map((date) => (
				<li key={date}>
					<Link
						className="link"
						href={`/group/${viewedGroupId}/session-temp/${date}`}
					>
						{formatDate(new Date(date), 'EEE do MMMM yyyy')}
					</Link>
				</li>
			))}
		</BoxyList>
	);
}
