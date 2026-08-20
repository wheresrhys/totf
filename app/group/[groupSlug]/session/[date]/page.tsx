import { notFound } from 'next/navigation';
import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { resolveGroupIdBySlug } from '@/lib/group-slug';
import {
	fetchSessionData,
	SessionSummary,
	type DayData,
	type PageParams
} from '../_shared';

type PageProps = { params: Promise<{ groupSlug: string; date: string }> };

export default async function CrossGroupSessionPage({ params }: PageProps) {
	const { groupSlug, date } = await params;
	const viewedGroupId = await resolveGroupIdBySlug(groupSlug);
	if (viewedGroupId === null) {
		notFound();
	}
	const viewedGroup = { id: viewedGroupId, slug: groupSlug };
	return (
		<BootstrapPageData<DayData, PageProps, PageParams>
			viewedGroup={viewedGroup}
			getParams={async () => ({
				viewedGroupId,
				date,
				locationId: undefined,
				viewedGroup
			})}
			getCacheKeys={() => ['session', date]}
			dataFetcher={fetchSessionData}
			PageComponent={SessionSummary}
			ttl={3600 * 24 * 7}
		/>
	);
}
