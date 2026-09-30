import YearMonthSummaryPage from '@/app/(routes)/summary/[yearOrMonth]/[month]/page';
import { withGroupScope } from '@/app/components/layout/withGroupScope';
export default withGroupScope<{ yearOrMonth: string; month: string }>(
	({ viewedGroup, params }) => (
		<YearMonthSummaryPage
			params={Promise.resolve(params)}
			viewedGroup={viewedGroup}
		/>
	)
);
