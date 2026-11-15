import { withGroupScope } from '@/app/components/layout/withGroupScope';
import StatsPivotPage from '@/app/(routes)/stats-pivot/page';

export default withGroupScope(({ viewedGroup }) => (
	<StatsPivotPage viewedGroup={viewedGroup} />
));
