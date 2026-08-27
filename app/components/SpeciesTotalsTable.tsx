import { deriveSpeciesTotalsRow } from '@/app/models/species-totals';
import type { AggregateStatsResult } from '@/app/models/db';
import {
	type ColumnConfig,
	SortableTable,
	type RowModelWithRawData
} from './shared/SortableTable';
import {
	buildStandardColumnConfigs,
	buildTotalsRowCells,
	createNameLinkCell
} from './shared/StatsTableColumnConfigs';

type RowModel = {
	speciesName: string;
	sessionsCount: number;
	encounterCount: number;
	individualsCount: number;
	new: number;
	retraps: number;
	pullus: number;
	juvs: number;
	postjuv: number;
	adults: number;
	unknownAge: number;
	newYoung: number;
};

const SpeciesNameCell = createNameLinkCell<AggregateStatsResult, RowModel>(
	(model) => model.speciesName,
	(model) => `/species/${model.speciesName}`
);

function rowDataTransform(stat: AggregateStatsResult): RowModel {
	const row = deriveSpeciesTotalsRow(stat);
	return {
		speciesName: row.speciesName,
		sessionsCount: row.sessionsCount,
		encounterCount: row.encounterCount,
		individualsCount: row.individualsCount,
		new: row.newCount,
		retraps: row.retrapsCount,
		pullus: row.pullusCount,
		juvs: row.juvsCount,
		postjuv: row.postjuvCount,
		adults: row.adultsCount,
		unknownAge: row.unknownAgeCount,
		newYoung: row.newYoungCount
	};
}

function buildColumnConfigs(
	hasPulli: boolean
): Partial<Record<keyof RowModel, ColumnConfig>> {
	return {
		speciesName: {
			label: 'Species',
			invertSort: true
		},
		sessionsCount: {
			label: 'Sessions'
		},
		encounterCount: {
			label: 'Encounters'
		},
		individualsCount: {
			label: 'Individuals'
		},
		...buildStandardColumnConfigs<RowModel>(hasPulli)
	};
}

function SpeciesTotalsTableBody({
	data,
	columnConfigs
}: {
	data: RowModelWithRawData<AggregateStatsResult, RowModel>[];
	columnConfigs?: Partial<Record<keyof RowModel, ColumnConfig>>;
}) {
	const orderedColumnProperties = Object.keys(columnConfigs ?? {}).filter(
		(property) => property !== 'speciesName'
	) as (keyof RowModel)[];

	return (
		<tbody>
			{data.map((row) => (
				<tr key={row.speciesName}>
					<td>
						<SpeciesNameCell model={row} />
					</td>
					{orderedColumnProperties.map((property) => (
						<td
							key={property}
							className={columnConfigs?.[property]?.cellClassName}
						>
							{row[property]}
						</td>
					))}
				</tr>
			))}
		</tbody>
	);
}

export function SpeciesTotalsTable({
	speciesStats,
	totalsStats
}: {
	speciesStats: AggregateStatsResult[];
	totalsStats?: AggregateStatsResult;
}) {
	if (speciesStats.length === 0) {
		return <p>No species recorded.</p>;
	}

	const hasPulli = speciesStats.some((stat) => stat.pullus_count > 0);
	const columnConfigs = buildColumnConfigs(hasPulli);

	const totalsRow = totalsStats
		? buildTotalsRowCells<RowModel>({
				columnConfigs,
				totalsRowModel: rowDataTransform(totalsStats)
			})
		: undefined;

	return (
		<SortableTable<AggregateStatsResult, RowModel>
			columnConfigs={columnConfigs}
			data={speciesStats}
			testId="species-totals-table"
			rowDataTransform={rowDataTransform}
			totalsRow={totalsRow}
			TableBodyComponent={SpeciesTotalsTableBody}
		/>
	);
}
