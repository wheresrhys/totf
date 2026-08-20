import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import type { ViewedGroup } from '@/lib/group-slug';
import { HighlightsHeading } from './_shared';

export type PageData = Record<string, never>;

export async function fetchAllTimeHighlightsData(): Promise<PageData> {
	return {};
}

function AllTimeHighlights() {
	return <HighlightsHeading />;
}

export default async function HighlightsPage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPageData<PageData>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['highlights']}
			dataFetcher={fetchAllTimeHighlightsData}
			PageComponent={AllTimeHighlights}
		/>
	);
}
