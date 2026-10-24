import { withGroupScope } from '@/app/components/layout/withGroupScope';
import AllSpeciesPage from '@/app/(routes)/species/page';

// `searchParams` has to be forwarded explicitly — `withGroupScope` hands it to
// this callback but can't know whether the delegated page wants it. Without it
// `?year=`/`?month=`/`?fromDate=`/`?toDate=` never reach this page's
// `getParams`, so every group-scoped `TemporalFilterControls` selection would
// silently no-op (#1096's same lesson, applied to #1076's new query params).
export default withGroupScope(({ viewedGroup, searchParams }) => (
	<AllSpeciesPage viewedGroup={viewedGroup} searchParams={searchParams} />
));
