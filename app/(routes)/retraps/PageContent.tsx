import { NotableRetrapsResult } from '@/app/models/db';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { NotableRetrapsTable } from '@/app/components/NotableRetrapsTable';

export function RetrapsPageContent({ data }: { data: NotableRetrapsResult[] }) {
	return (
		<PageWrapper>
			<PrimaryHeading>Notable Birds</PrimaryHeading>
			<NotableRetrapsTable data={data} />
		</PageWrapper>
	);
}
