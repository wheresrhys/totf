import {
	BootstrapPageData,
	type DefaultPageParams
} from '@/app/components/layout/BootstrapPageData';
import { fetchRingSequenceSummaries } from '@/app/actions/ring-sequences';
import type { RingSequenceSummary } from '@/app/actions/ring-sequences';
import { RingSequencesPage } from '@/app/components/RingSequencesPage';

async function dataFetcher(
	_: DefaultPageParams,
	viewedGroupId: number
): Promise<RingSequenceSummary[] | null> {
	return fetchRingSequenceSummaries(viewedGroupId);
}

export default async function RingSequencesRoute({
	viewedGroupId
}: {
	viewedGroupId?: number;
} = {}) {
	return (
		<BootstrapPageData<RingSequenceSummary[]>
			viewedGroupId={viewedGroupId}
			getCacheKeys={() => ['ring-sequences']}
			dataFetcher={dataFetcher}
			PageComponent={RingSequencesPage}
		/>
	);
}
