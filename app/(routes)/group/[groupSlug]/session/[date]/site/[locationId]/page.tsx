import { notFound } from 'next/navigation';
import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import { resolveGroupIdBySlug } from '@/lib/group-slug';
import { fetchSessionPageContent } from '../../page';
import {
	SessionPageContent,
	type DayData,
	type PageParams
} from '../../PageContent';

type PageProps = {
	params: Promise<{ groupSlug: string; date: string; locationId: string }>;
};

export default async function GroupSessionSitePage({ params }: PageProps) {
	const { groupSlug, date, locationId } = await params;
	const viewedGroupId = await resolveGroupIdBySlug(groupSlug);
	if (viewedGroupId === null) {
		notFound();
	}
	const viewedGroup = { id: viewedGroupId, slug: groupSlug };
	return (
		<BootstrapPage<DayData, PageProps, PageParams>
			viewedGroup={viewedGroup}
			getParams={async () => ({
				viewedGroupId,
				date,
				locationId: Number(locationId)
			})}
			getCacheKeys={() => ['session', date, `loc-${locationId}`]}
			dataFetcher={fetchSessionPageContent}
			PageComponent={SessionPageContent}
			ttl={3600 * 24 * 7}
		/>
	);
}
