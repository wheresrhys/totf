import YearMonthSummaryPage from '@/app/(routes)/summary/[yearOrMonth]/[month]/page';
import { withGroupScope } from '@/app/components/layout/withGroupScope';
// `searchParams` has to be forwarded explicitly — `withGroupScope` hands it to
// this callback but can't know whether the delegated page wants it. Without it
// `?tabId=` never reaches `getSummaryYearMonthPageParams`, so every
// group-scoped deep link silently opened the page's default tab (#1096).
export default withGroupScope<{ yearOrMonth: string; month: string }>(
	({ viewedGroup, params, searchParams }) => (
		<YearMonthSummaryPage
			params={Promise.resolve(params)}
			searchParams={searchParams}
			viewedGroup={viewedGroup}
		/>
	)
);
