import {
	BootstrapPageData,
	type DefaultPageParams
} from '@/app/components/layout/BootstrapPageData';
import {
	fetchRingSequenceControls,
	type RingSequenceControlRow
} from '@/app/actions/ring-sequences';
import { ControlsPage } from '@/app/components/ControlsPage';
import type { ViewedGroup } from '@/lib/group-slug';

async function dataFetcher(
	_: DefaultPageParams,
	viewedGroupId: number
): Promise<RingSequenceControlRow[] | null> {
	return fetchRingSequenceControls(viewedGroupId);
}

export default async function ControlsRoute({
	viewedGroup
}: {
	viewedGroupId?: number;
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPageData<RingSequenceControlRow[]>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['controls']}
			dataFetcher={dataFetcher}
			PageComponent={ControlsPage}
		/>
	);
}
