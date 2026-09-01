import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import { fetchControlsPageContent, ControlsPageContent } from './PageContent';
import type { RingSequenceControlRow } from '@/app/actions/ring-sequences';
import type { ViewedGroup } from '@/lib/group-slug';

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
