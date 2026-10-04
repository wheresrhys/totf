import AllTimeSummaryPage from '@/app/(routes)/summary/page';
import { withGroupScope } from '@/app/components/layout/withGroupScope';

// `searchParams` has to be forwarded explicitly — `withGroupScope` hands it to
// this callback but can't know whether the delegated page wants it. Without it
// `?tabId=` never reaches `getSummaryPageParams`, so every group-scoped deep
// link silently opened the page's default tab (#1096).
export default withGroupScope(({ viewedGroup, searchParams }) => (
	<AllTimeSummaryPage viewedGroup={viewedGroup} searchParams={searchParams} />
));
