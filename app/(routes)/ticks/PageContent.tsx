import type { ViewedGroup } from '@/app/lib/group-slug';
import {
	buildTemporalQueryStrings,
	describeTemporalSelection
} from '@/app/lib/temporal-filter';
import {
	BoxyList,
	PageWrapper,
	PrimaryHeading,
	TemporalFilterControls
} from '@/modules/ui-kit';
import { format as formatDate } from 'date-fns';
import type { TicksPageData, TicksPageParams } from './page';

function buildYearOptions(firstYear: number | null): number[] {
	if (firstYear === null) {
		return [];
	}
	const currentYear = new Date().getFullYear();
	return Array.from(
		{ length: currentYear - firstYear + 1 },
		(_, index) => firstYear + index
	);
}

export function TicksPageContent({
	params: { selection },
	data: { ticks, firstYear },
	viewedGroup
}: {
	params: TicksPageParams;
	data: TicksPageData;
	viewedGroup: ViewedGroup;
}) {
	const isFiltered =
		Object.keys(buildTemporalQueryStrings(selection)).length > 0;
	// In the group's first year every tick is a first-ever one, so badging them
	// would add nothing.
	const showFirstEverBadges = isFiltered && selection.year !== firstYear;

	return (
		<PageWrapper>
			<PrimaryHeading>
				{isFiltered
					? `Ticks for ${describeTemporalSelection(selection)}`
					: 'Ticks'}
			</PrimaryHeading>
			<div className="mb-2">
				<TemporalFilterControls
					years={buildYearOptions(firstYear)}
					baseUrl={`/group/${viewedGroup.slug}/ticks`}
					initialSelection={selection}
				/>
			</div>
			{ticks.length === 0 ? (
				<p>{isFiltered ? 'No ticks in this period.' : 'No ticks yet.'}</p>
			) : (
				<BoxyList>
					{ticks.map((tick, index) => (
						<li key={`${tick.species_name}-${tick.first_encounter_date}`}>
							{/* Numbered in reverse so the oldest tick is 1 and the count reads at the top. */}
							{ticks.length - index}. {tick.species_name} on{' '}
							{formatDate(new Date(tick.first_encounter_date), 'do MMMM yyyy')}
							{showFirstEverBadges && tick.is_first_ever ? (
								<span
									className="badge badge-warning ml-2"
									data-testid="first-ever-badge"
								>
									first ever
								</span>
							) : null}
						</li>
					))}
				</BoxyList>
			)}
		</PageWrapper>
	);
}
