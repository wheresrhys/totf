import { withGroupScope } from '@/app/components/layout/withGroupScope';
import StatsPivotPage from '@/app/(routes)/stats-pivot/page';

export default withGroupScope(({ viewedGroup, searchParams }) => (
	<StatsPivotPage viewedGroup={viewedGroup} searchParams={searchParams} />
));
