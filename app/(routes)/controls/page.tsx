import {
	BootstrapPageData,
	type DefaultPageParams
} from '@/app/components/layout/BootstrapPageData';
import {
	fetchRingSequenceControls,
	type RingSequenceControlRow
} from '@/app/actions/ring-sequences';
import { ControlsPage } from '@/app/components/ControlsPage';

async function dataFetcher(
	_: DefaultPageParams,
	viewedGroupId: number
): Promise<RingSequenceControlRow[] | null> {
	return fetchRingSequenceControls(viewedGroupId);
}

export default async function ControlsRoute({
	viewedGroupId
}: {
	viewedGroupId?: number;
} = {}) {
	return (
		<BootstrapPageData<RingSequenceControlRow[]>
			viewedGroupId={viewedGroupId}
			getCacheKeys={() => ['controls']}
			dataFetcher={dataFetcher}
			PageComponent={ControlsPage}
		/>
	);
}
