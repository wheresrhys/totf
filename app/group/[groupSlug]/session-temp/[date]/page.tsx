import { notFound } from 'next/navigation';
import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { resolveGroupIdBySlug } from '@/lib/group-slug';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { format as formatDate } from 'date-fns';

type PageParams = { date: string };

// No session data exists to fetch yet — this page derives its heading
// entirely from the date route param. BootstrapPageData's LoadWithData
// calls notFound() when data is falsy, so this stub must stay truthy.
async function fetchSessionTempData(): Promise<{ loaded: true }> {
	return { loaded: true };
}

function SessionTempSummary({ params: { date } }: { params: PageParams }) {
	return (
		<PageWrapper>
			<PrimaryHeading>
				{formatDate(new Date(date), 'EEE do MMMM yyyy')}
			</PrimaryHeading>
		</PageWrapper>
	);
}

type PageProps = { params: Promise<{ groupSlug: string; date: string }> };

export default async function SessionTempPage({ params }: PageProps) {
	const { groupSlug, date } = await params;
	const viewedGroupId = await resolveGroupIdBySlug(groupSlug);
	if (viewedGroupId === null) {
		notFound();
	}
	const viewedGroup = { id: viewedGroupId, slug: groupSlug };
	return (
		<BootstrapPageData<{ loaded: true }, PageProps, PageParams>
			viewedGroup={viewedGroup}
			getParams={async () => ({ date })}
			getCacheKeys={() => ['session-temp', date]}
			dataFetcher={fetchSessionTempData}
			PageComponent={SessionTempSummary}
		/>
	);
}
