import { withGroupScope } from '@/app/components/layout/withGroupScope';
import TicksPage from '@/app/(routes)/ticks/page';

export default withGroupScope(({ viewedGroup, searchParams }) => (
	<TicksPage viewedGroup={viewedGroup} searchParams={searchParams} />
));
