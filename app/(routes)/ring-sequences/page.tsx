import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import {
	fetchRingSequences,
	fetchUnassignedImportPrefixes
} from '@/app/actions/ring-sequences';
import {
	RingSequencesPageContent,
	type RingSequencesPageData
} from './PageContent';
import type { ViewedGroup } from '@/lib/group-slug';

export async function fetchRingSequencesPageContent(
	_params: Record<string, string>,
	viewedGroupId: number
): Promise<RingSequencesPageData | null> {
	const [sequences, unassignedPrefixes] = await Promise.all([
		fetchRingSequences(viewedGroupId),
		fetchUnassignedImportPrefixes(viewedGroupId)
	]);
	if (!sequences || !unassignedPrefixes) return null;
	return { sequences, unassignedPrefixes };
}

export default async function RingSequencesPage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPage<RingSequencesPageData>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['ring-sequences']}
			dataFetcher={fetchRingSequencesPageContent}
			PageComponent={RingSequencesPageContent}
		/>
	);
}
