import { withGroupScope } from '@/app/components/layout/withGroupScope';
import SpeciesPage from '@/app/(routes)/species/[speciesName]/page';

// `searchParams` has to be forwarded explicitly — `withGroupScope` hands it to
// this callback but can't know whether the delegated page wants it. Without it
// `?tabId=` never reaches this page's `getParams`, so every group-scoped deep
// link silently opened the page's default tab (#1096).
export default withGroupScope<{ speciesName: string }>(
	({ viewedGroup, params, searchParams }) => (
		<SpeciesPage
			params={Promise.resolve({ speciesName: params.speciesName })}
			searchParams={searchParams}
			viewedGroup={viewedGroup}
		/>
	)
);
