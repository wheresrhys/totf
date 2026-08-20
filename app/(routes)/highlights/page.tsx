import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import type { ViewedGroup } from '@/lib/group-slug';
import { buildAllTimeHeading } from './_shared';

export type PageData = Record<string, never>;

export async function fetchAllTimeHighlightsData(): Promise<PageData> {
	return {};
}

function AllTimeHighlights() {
	return (
		<PageWrapper>
			<PrimaryHeading>{buildAllTimeHeading()}</PrimaryHeading>
		</PageWrapper>
	);
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
