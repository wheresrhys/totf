import {
	BootstrapPage,
	type DefaultPageParams
} from '@/app/components/layout/BootstrapPage';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { fetchOwnGroupPublicAreas } from '@/app/actions/settings';
import { SettingsPageContent, type SettingsPageData } from './PageContent';

export async function fetchSettingsPageContent(
	_: DefaultPageParams,
	viewedGroupId: number
): Promise<SettingsPageData> {
	const publicAreas = await fetchOwnGroupPublicAreas(viewedGroupId);
	return { publicSummaryEnabled: publicAreas.includes('summary') };
}

export default async function SettingsPage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPage<SettingsPageData>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['settings']}
			dataFetcher={fetchSettingsPageContent}
			PageComponent={SettingsPageContent}
		/>
	);
}
