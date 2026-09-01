import { DiscrepenciesResult } from '@/app/models/db';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { MistakesTable } from '@/app/components/pages/mistakes/MistakesTable';

export function MistakesPageContent({ data }: { data: DiscrepenciesResult[] }) {
	return (
		<PageWrapper>
			<PrimaryHeading>Mistakes</PrimaryHeading>
			<MistakesTable mistakes={data} />
		</PageWrapper>
	);
}
