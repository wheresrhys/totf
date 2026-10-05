import {
	BootstrapPage,
	type DefaultPageParams
} from '@/app/components/layout/BootstrapPage';
import { ControlsPageContent } from './PageContent';
import {
	fetchRingSequenceControls,
	type RingSequenceControlRow
} from '@/app/actions/ring-sequences';
import type { ViewedGroup } from '@/app/lib/group-slug';

async function fetchControlsPageContent(
	_: DefaultPageParams,
	viewedGroup: ViewedGroup
): Promise<RingSequenceControlRow[] | null> {
	return fetchRingSequenceControls(viewedGroup);
}

export default async function ControlsPage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPage<RingSequenceControlRow[]>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['controls']}
			dataFetcher={fetchControlsPageContent}
			PageComponent={ControlsPageContent}
		/>
	);
}
