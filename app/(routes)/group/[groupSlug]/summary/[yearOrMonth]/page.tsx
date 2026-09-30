import YearOrMonthSummaryPage from '@/app/(routes)/summary/[yearOrMonth]/page';
import { withGroupScope } from '@/app/components/layout/withGroupScope';
export default withGroupScope<{ yearOrMonth: string }>(
	({ viewedGroup, params }) => (
		<YearOrMonthSummaryPage
			params={Promise.resolve(params)}
			viewedGroup={viewedGroup}
		/>
	)
);
