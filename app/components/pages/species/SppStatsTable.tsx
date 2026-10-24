'use client';
import { PageWrapper } from '@/app/components/shared/DesignSystem';
import {
	speciesStatConfigs,
	type SpeciesStatsRow
} from '@/app/lib/species-stats';
import type { PageData } from '@/app/(routes)/species/page';
import type { ViewedGroup } from '@/app/lib/group-slug';
import {
	SortableTable,
	type ColumnConfig
} from '@/app/components/shared/SortableTable';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import { TemporalFilterControls } from '@/app/components/shared/TemporalFilterControls';

function MultiSpeciesTableBody({ data }: { data: SpeciesStatsRow[] }) {
	return (
		<tbody>
			{data.map((species) => (
				<tr key={species.species_name}>
					{speciesStatConfigs.map((column) =>
						column.property === 'species_name' ? (
							<td key={column.property}>
								<NoPrefetchLink
									className="link text-wrap"
									href={`/species/${species.species_name}`}
								>
									{species.species_name}
								</NoPrefetchLink>
							</td>
						) : (
							<td key={column.property}>{species[column.property]}</td>
						)
					)}
				</tr>
			))}
		</tbody>
	);
}

const sortableColumnConfigs = speciesStatConfigs.reduce(
	(acc, column) => ({
		...acc,
		[column.property]: {
			label: column.label,
			preferSortAscending: column.preferSortAscending
		}
	}),
	{} as Record<keyof SpeciesStatsRow, ColumnConfig>
);

// The species list page's filter UI (#1051/#1076) — the generic
// `TemporalFilterControls` component, with no `navigationController` override:
// this page has no year/month path-param routing of its own (unlike
// Summary/species-detail), so every filter field lives in the query string on
// `/species` via the component's default navigation. The "CES only" preset
// this replaced is gone with no replacement — per the #1076 decision, a raw
// date range covers that case (and any other) without a bespoke checkbox.
export function SppStatsTable({
	data: { speciesStats, years, selection }
}: {
	data: PageData;
	viewedGroup?: ViewedGroup;
}) {
	return (
		<>
			<PageWrapper>
				<TemporalFilterControls
					years={years}
					baseUrl="/species"
					initialSelection={selection}
				/>
			</PageWrapper>
			<SortableTable<SpeciesStatsRow, SpeciesStatsRow>
				columnConfigs={sortableColumnConfigs}
				data={speciesStats}
				rowDataTransform={(data) => data}
				TableBodyComponent={MultiSpeciesTableBody}
			/>
		</>
	);
}
