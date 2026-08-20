import { format as formatDate } from 'date-fns';
import Link from 'next/link';
import { BoxyList } from './shared/DesignSystem';
import { type ViewedGroup } from '@/lib/group-slug';
export function SessionLinksList({
	sessionDates,
	viewedGroup
}: {
	sessionDates: string[];
	viewedGroup: ViewedGroup;
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
						href={`/group/${viewedGroup.slug}/session-temp/${date}`}
					>
						{formatDate(new Date(date), 'EEE do MMMM yyyy')}
					</Link>
				</li>
			))}
		</BoxyList>
	);
}
