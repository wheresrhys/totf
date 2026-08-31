import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { fetchRingSequences } from '@/app/actions/ring-sequences';
import type { RingSequenceRow } from '@/app/models/db';
import { RingSequencesPage } from '@/app/components/RingSequencesPage';
import type { ViewedGroup } from '@/lib/group-slug';

async function dataFetcher(
	_params: Record<string, string>,
	viewedGroupId: number
): Promise<RingSequenceRow[] | null> {
	return fetchRingSequences(viewedGroupId);
}

export default async function RingSequencesRoute({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPageData<RingSequenceRow[]>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['ring-sequences']}
			dataFetcher={dataFetcher}
			PageComponent={RingSequencesPage}
		/>
	);
}
