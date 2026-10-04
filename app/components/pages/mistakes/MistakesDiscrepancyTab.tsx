'use client';
import { useEffect, useMemo, useState } from 'react';
import { format as formatDate } from 'date-fns';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import { AccordionTableBody } from '@/app/components/shared/AccordionTableBody';
import { SingleBirdTable } from '@/app/components/SingleBirdTable';
import { fetchBirdEncounters } from '@/app/actions/bird-encounters';
import type { EncounterOfBird } from '@/app/models/bird';
import type { DiscrepenciesResult } from '@/app/models/db';
import {
	SortableTable,
	type ColumnConfig,
	type RowModelWithRawData,
	getFormattedValue
} from '@/app/components/shared/SortableTable';

type MistakesRowModel = {
	ringNo: string;
	speciesName: string;
	lastEncounterDate: Date;
};

type MistakesRow = RowModelWithRawData<DiscrepenciesResult, MistakesRowModel>;

function dateFormatter(value: unknown): string {
	return formatDate(value as Date, 'dd MMM yyyy');
}

const columnConfigs = {
	ringNo: {
		label: 'Bird',
		preferSortAscending: true
	},
	speciesName: {
		label: 'Species',
		preferSortAscending: true
	},
	lastEncounterDate: {
		label: 'Last seen',
		formatter: dateFormatter
	}
} as Record<keyof MistakesRowModel, ColumnConfig>;

const cellFormatter = getFormattedValue<MistakesRowModel>(columnConfigs);

/**
 * Which encounters of an expanded bird to call out as the likely culprits for
 * this tab's kind of discrepancy — the odd-one-out sexings/ageings, or the
 * wing lengths furthest from the bird's own median.
 */
export function makeHighlighter(
	discrepancyType: string,
	encounters: EncounterOfBird[]
): (encounter: EncounterOfBird) => boolean {
	if (discrepancyType === 'sex') {
		return (enc) => !!enc.sex && enc.sex.toLowerCase() !== 'u';
	}
	if (discrepancyType === 'age') {
		return (enc) => enc.age_code != null && enc.age_code >= 2;
	}
	if (discrepancyType === 'wing_length') {
		const measured = encounters
			.filter((e) => e.wing_length != null)
			.map((e) => e.wing_length as number)
			.sort((a, b) => a - b);
		if (measured.length === 0) return () => false;
		const mid = Math.floor(measured.length / 2);
		const median =
			measured.length % 2 === 0
				? (measured[mid - 1] + measured[mid]) / 2
				: measured[mid];
		const maxDist = Math.max(...measured.map((m) => Math.abs(m - median)));
		return (enc) =>
			enc.wing_length != null && Math.abs(enc.wing_length - median) === maxDist;
	}
	return () => false;
}

function LazyBirdDetail({
	model,
	discrepancyType
}: {
	model: MistakesRow;
	discrepancyType: string;
}) {
	const [encounters, setEncounters] = useState<EncounterOfBird[] | null>(null);
	const { ring_no } = model._rawRowData;

	useEffect(() => {
		fetchBirdEncounters(ring_no).then(setEncounters);
	}, [ring_no]);

	if (!encounters) {
		return <p>Loading...</p>;
	}

	return (
		<SingleBirdTable
			encounters={encounters}
			isInline={true}
			highlightRow={makeHighlighter(discrepancyType, encounters)}
		/>
	);
}

function RingCell({ model }: { model: MistakesRow }) {
	return (
		<NoPrefetchLink className="link" href={`/bird/${model.ringNo}`}>
			{model.ringNo}
		</NoPrefetchLink>
	);
}

function RestColumns({ model }: { model: MistakesRow }) {
	return (
		<>
			<td>{model.speciesName}</td>
			<td>{cellFormatter(model.lastEncounterDate, 'lastEncounterDate')}</td>
		</>
	);
}

function rowDataTransform(mistake: DiscrepenciesResult): MistakesRowModel {
	return {
		ringNo: mistake.ring_no,
		speciesName: mistake.species_name,
		lastEncounterDate: new Date(mistake.last_encounter_date)
	};
}

/**
 * One discrepancy type's worth of the mistakes page: a sortable, row-expandable
 * table of the birds whose records disagree with themselves in that one way.
 *
 * Fully prop-fed — the whole page's `find_discrepencies` rows are fetched once
 * in `page.tsx` and grouped by type before this ever renders, so this tab has
 * no `dataFetcher` of its own (see `MistakesPageContent`).
 */
export function MistakesDiscrepancyTab({
	discrepancyType,
	mistakes
}: {
	discrepancyType: string;
	mistakes: DiscrepenciesResult[];
}) {
	// Both of these are rendered as JSX element *types*, so an inline arrow
	// would be a fresh component identity on every re-render of this tab —
	// which, now that the tab stays mounted while another one is shown
	// (`ConditionalTabPanel`), would throw away `AccordionTableBody`'s
	// expanded-row state and refetch an expanded bird's encounters on every
	// tab switch. Memoised on the one value they close over, which for a given
	// tab never changes.
	const MistakesTableBody = useMemo(() => {
		function ExpandedBirdDetail({ model }: { model: MistakesRow }) {
			return <LazyBirdDetail model={model} discrepancyType={discrepancyType} />;
		}
		return function MistakesTableBody({ data }: { data: MistakesRow[] }) {
			return (
				<AccordionTableBody<MistakesRow>
					data={data}
					getKey={(item) => item.ringNo}
					columnCount={Object.keys(columnConfigs).length}
					FirstColumnComponent={RingCell}
					RestColumnsComponent={RestColumns}
					ExpandedContentComponent={ExpandedBirdDetail}
				/>
			);
		};
	}, [discrepancyType]);

	return (
		<SortableTable<DiscrepenciesResult, MistakesRowModel>
			columnConfigs={columnConfigs}
			data={mistakes}
			initialSortColumn="speciesName"
			rowDataTransform={rowDataTransform}
			TableBodyComponent={MistakesTableBody}
		/>
	);
}
