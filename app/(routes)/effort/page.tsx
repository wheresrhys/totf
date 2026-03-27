import {
	BootstrapPageData,
	type DefaultPageParams
} from '@/app/components/layout/BootstrapPageData';
import {
	PageWrapper,
	PrimaryHeading,
	Table
} from '@/app/components/shared/DesignSystem';
import { format as formatDate } from 'date-fns';
import {
	fetchPayOffStats,
	type PayOffStatsData
} from '@/app/actions/pay-off-stats';
import type { AggregateStatsRow } from '@/app/models/db';
import { formatPostgresIntervalForDisplay } from '@/lib/postgres-interval';
import { PayOffEffortChart } from '@/app/components/PayOffEffortChart';

export async function fetchPayOffPageData(
	_params: DefaultPageParams,
	groupId: number
): Promise<PayOffStatsData | null> {
	return fetchPayOffStats(groupId);
}

function formatAvgEncounters(n: number | null | undefined): string {
	if (n == null || Number.isNaN(n)) return '—';
	return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Expects `yearly` from aggregate_stats with group_by_time_period 'year' (ascending by time_period). */
function PayOffYearlyTable({ yearly }: { yearly: AggregateStatsRow[] }) {
	const metricRows: {
		label: string;
		cell: (row: AggregateStatsRow) => string;
	}[] = [
		{
			label: 'Total ringing effort',
			cell: (row) => formatPostgresIntervalForDisplay(row.total_effort)
		},
		{
			label: 'Ringing session count',
			cell: (row) => String(row.session_count)
		},
		{
			label: 'Encounter count',
			cell: (row) => String(row.encounter_count)
		},
		{
			label: 'Individual bird count',
			cell: (row) => String(row.bird_count)
		},
		{
			label: 'Species count',
			cell: (row) => String(row.species_count)
		},
		{
			label: 'Average encounters per session',
			cell: (row) => formatAvgEncounters(row.avg_encounters_per_session)
		},
		{
			label: 'Effort per encounter',
			cell: (row) => formatPostgresIntervalForDisplay(row.effort_per_encounter)
		}
	];

	if (yearly.length === 0) {
		return (
			<p className="text-base-content/70">No yearly data for this group yet.</p>
		);
	}

	return (
		<Table>
			<thead>
				<tr>
					<th scope="col" className="sticky left-0 z-10 bg-base-100">
						Metric
					</th>
					{yearly.map((row) => (
						<th key={row.time_period} scope="col" className="text-end">
							{formatDate(new Date(row.time_period), 'yyyy')}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{metricRows.map((metric) => (
					<tr key={metric.label}>
						<th
							scope="row"
							className="sticky left-0 z-10 bg-base-100 font-normal whitespace-nowrap"
						>
							{metric.label}
						</th>
						{yearly.map((row) => (
							<td key={row.time_period} className="text-end tabular-nums">
								{metric.cell(row)}
							</td>
						))}
					</tr>
				))}
			</tbody>
		</Table>
	);
}

function PayOffPageContent({
	data
}: {
	data: PayOffStatsData;
	groupId: number;
}) {
	return (
		<PageWrapper>
			<PrimaryHeading>Effort and Pay-off</PrimaryHeading>
			<PayOffYearlyTable yearly={data.yearly} />
			{data.monthly.length === 0 ? (
				<p className="text-base-content/70">No monthly data yet.</p>
			) : (
				<div className="w-full min-h-[320px]">
					<PayOffEffortChart monthly={data.monthly} />
				</div>
			)}
		</PageWrapper>
	);
}

export default function PayOffPage() {
	return (
		<BootstrapPageData<PayOffStatsData>
			getCacheKeys={() => ['sessions', 'pay-off']}
			dataFetcher={fetchPayOffPageData}
			PageComponent={PayOffPageContent}
		/>
	);
}
