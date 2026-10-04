import { withGroupScope } from '@/app/components/layout/withGroupScope';
import ResightingsPage from '@/app/(routes)/resightings/page';

export default withGroupScope(({ viewedGroup, searchParams }) => (
	<ResightingsPage viewedGroup={viewedGroup} searchParams={searchParams} />
));
