import { Table } from '@/app/components/shared/DesignSystem';
import type { AggregateStatsResult } from '@/app/models/db';
import { formatPostgresIntervalForDisplay } from '@/lib/postgres-interval';
import { calculateRetraps } from '@/app/models/species-totals';

export function SummaryStatsSection({
	stats
}: {
	stats: AggregateStatsResult | null;
}) {
	if (!stats) {
		return null;
	}

	const rows: { label: string; value: number | string }[] = [
		{ label: 'Sessions', value: stats.session_count },
		{
			label: 'Effort',
			value: formatPostgresIntervalForDisplay(stats.total_effort)
		},
		{ label: 'Species', value: stats.species_count },
		{ label: 'Encounters', value: stats.encounter_count },
		{ label: 'Individuals', value: stats.bird_count },
		{ label: 'New', value: stats.new_bird_count },
		{ label: 'Retraps', value: calculateRetraps(stats) },
		{ label: 'Pulli', value: stats.pullus_count },
		{ label: 'Juvs', value: stats.juv_count },
		{ label: 'Postjuvs', value: stats.postjuv_count },
		{ label: 'Adults', value: stats.adult_count },
		{ label: 'Not aged', value: stats.unknown_age_count },
		{ label: 'New young', value: stats.new_young_count }
	];
	return (
		<Table testId="summary-stats-section">
			<tbody>
				{rows.map((row) => (
					<tr key={row.label}>
						<th scope="row">{row.label}</th>
						<td>{row.value}</td>
					</tr>
				))}
			</tbody>
		</Table>
	);
}
