import { BootstrapPage } from '../components/layout/BootstrapPage';
import type { ViewedGroup } from '@/lib/group-slug';
import {
	fetchHomePageContent,
	HomePageContent,
	type PageModel
} from './PageContent';

export default async function HomePage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPage<PageModel>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['home-stats']}
			dataFetcher={fetchHomePageContent}
			PageComponent={HomePageContent}
		/>
	);
}
