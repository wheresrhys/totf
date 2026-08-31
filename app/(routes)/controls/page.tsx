import {
	BootstrapPage,
	type DefaultPageParams
} from '@/app/components/layout/BootstrapPage';
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
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPage<RingSequenceControlRow[]>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['controls']}
			dataFetcher={dataFetcher}
			PageComponent={ControlsPage}
		/>
	);
}
