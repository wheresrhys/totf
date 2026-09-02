import { ResightingEncounter } from '@/app/models/session';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { ResightingsTable } from '@/app/components/pages/resightings/ResightingsTable';

export function ResightingsPageContent({
	data
}: {
	data: ResightingEncounter[];
}) {
	return (
		<PageWrapper>
			<PrimaryHeading>Resightings</PrimaryHeading>
			<ResightingsTable resightings={data} />
		</PageWrapper>
	);
}
