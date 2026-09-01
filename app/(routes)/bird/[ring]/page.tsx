import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import type { StandaloneBird } from '@/app/models/bird';
import type { ViewedGroup } from '@/lib/group-slug';
import {
	fetchBirdPageContent,
	BirdPageContent,
	type PageParams
} from './PageContent';

type PageProps = { params: Promise<PageParams> };

export default async function BirdPage(
	props: PageProps & { viewedGroup?: ViewedGroup }
) {
	return (
		<BootstrapPage<StandaloneBird, PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getParams={async (pageProps: PageProps) => ({
				ring: (await pageProps.params).ring.toUpperCase()
			})}
			getCacheKeys={(params: PageParams) => ['bird', params.ring]}
			dataFetcher={fetchBirdPageContent}
			PageComponent={BirdPageContent}
		/>
	);
}
