import { PulliEncounter } from '@/app/models/session';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { PulliEncountersTable } from '@/app/components/pages/pulli/PulliEncountersTable';

export function PulliPageContent({ data }: { data: PulliEncounter[] }) {
	return (
		<PageWrapper>
			<PrimaryHeading>Pulli</PrimaryHeading>
			<PulliEncountersTable data={data} />
		</PageWrapper>
	);
}
