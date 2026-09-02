import { GroupTicksResult } from '@/app/models/db';
import {
	BoxyList,
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { format as formatDate } from 'date-fns';

export function TicksPageContent({ data }: { data: GroupTicksResult[] }) {
	return (
		<PageWrapper>
			<PrimaryHeading>Ticks</PrimaryHeading>
			{data.length === 0 ? (
				<p>No ticks yet.</p>
			) : (
				<BoxyList>
					{data.map((tick) => (
						<li key={`${tick.species_name}-${tick.first_encounter_date}`}>
							{tick.species_name} on{' '}
							{formatDate(new Date(tick.first_encounter_date), 'do MMMM yyyy')}
						</li>
					))}
				</BoxyList>
			)}
		</PageWrapper>
	);
}
