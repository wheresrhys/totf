import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import { fetchRingSequences } from '@/app/actions/ring-sequences';
import type { RingSequenceRow } from '@/app/models/db';
import { RingSequencesPageContent } from './PageContent';
import type { ViewedGroup } from '@/lib/group-slug';

export async function fetchRingSequencesPageContent(
	_params: Record<string, string>,
	viewedGroupId: number
): Promise<RingSequenceRow[] | null> {
	return fetchRingSequences(viewedGroupId);
}

export default async function RingSequencesPage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPage<RingSequenceRow[]>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['ring-sequences']}
			dataFetcher={fetchRingSequencesPageContent}
			PageComponent={RingSequencesPageContent}
		/>
	);
}
