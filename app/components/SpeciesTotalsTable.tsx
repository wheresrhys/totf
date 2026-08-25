import { deriveSpeciesTotalsRow } from '@/app/models/species-totals';
import type { AggregateStatsResult } from '@/app/models/db';

const COLUMN_LABELS = [
	'Species',
	'Encounters',
	'Individuals',
	'New',
	'Retraps',
	'Pullus',
	'Juvs',
	'Postjuv',
	'Adults',
	'Unknown age',
	'New young'
];

export function SpeciesTotalsTable({
	speciesStats
}: {
	speciesStats: AggregateStatsResult[];
}) {
	if (speciesStats.length === 0) {
		return <p>No species recorded.</p>;
	}

	return (
		<table>
			<thead>
				<tr>
					{COLUMN_LABELS.map((label) => (
						<th key={label}>{label}</th>
					))}
				</tr>
			</thead>
			<tbody>
				{speciesStats.map((stat) => {
					const row = deriveSpeciesTotalsRow(stat);
					return (
						<tr key={row.speciesName}>
							<td>{row.speciesName}</td>
							<td>{row.encounterCount}</td>
							<td>{row.individualsCount}</td>
							<td>{row.newCount}</td>
							<td>{row.retrapsCount}</td>
							<td>{row.pullusCount}</td>
							<td>{row.juvsCount}</td>
							<td>{row.postjuvCount}</td>
							<td>{row.adultsCount}</td>
							<td>{row.unknownAgeCount}</td>
							<td>{row.newYoungCount}</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}
