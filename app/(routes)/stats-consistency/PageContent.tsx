'use client';
import { useState } from 'react';
import { format as formatDate } from 'date-fns';
import { PageWrapper, PrimaryHeading, Table } from '@/modules/ui-kit';
import { regenerateStatsCache } from '@/app/actions/regenerate-stats-cache';
import type { OwnGroupImportJobRow } from '@/app/actions/import-jobs';
import type { ImportJobStatus } from '@/app/models/db';
import {
	temporalUnitNameMapping,
	type StatsTemporalUnit
} from '@/app/models/temporal-unit';
import { StatsCacheDiscrepanciesReport } from '@/app/components/pages/stats-consistency/StatsCacheDiscrepanciesReport';

export type StatsConsistencyPageData = {
	importJobs: OwnGroupImportJobRow[];
	speciesNamesById: Record<number, string>;
};

// One entry per ImportJobs.*_stats_refresh_status column, naming the
// StatsTemporalUnit `regenerateStatsCache` (app/actions/regenerate-stats-cache.ts)
// takes to retrigger that exact column — see ImportJobs.sql's own comment for
// why there is one column per temporal unit, not per stats type.
const REFRESH_COLUMNS: {
	key: Extract<
		keyof OwnGroupImportJobRow,
		| 'day_stats_refresh_status'
		| 'month_stats_refresh_status'
		| 'year_stats_refresh_status'
		| 'month_squashed_stats_refresh_status'
		| 'all_time_stats_refresh_status'
	>;
	temporalUnit: StatsTemporalUnit;
}[] = [
	{ key: 'day_stats_refresh_status', temporalUnit: 'day' },
	{ key: 'month_stats_refresh_status', temporalUnit: 'month' },
	{ key: 'year_stats_refresh_status', temporalUnit: 'year' },
	{
		key: 'month_squashed_stats_refresh_status',
		temporalUnit: 'month-squashed'
	},
	{ key: 'all_time_stats_refresh_status', temporalUnit: 'all-time' }
];

// Keyed by (job id, temporal unit) so one button's pending/retriggered/error
// state never leaks onto any other row's or column's button (#1388's own
// acceptance criteria).
type RetriggerButtonState =
	| { kind: 'idle' }
	| { kind: 'pending' }
	| { kind: 'retriggered' }
	| { kind: 'error'; message: string };

function retriggerButtonKey(jobId: number, temporalUnit: StatsTemporalUnit) {
	return `${jobId}:${temporalUnit}`;
}

function formatRowCount(count: number | null): string {
	return count == null ? '—' : String(count);
}

export function StatsConsistencyPageContent({
	data
}: {
	data: StatsConsistencyPageData;
}) {
	const [buttonStates, setButtonStates] = useState<
		Record<string, RetriggerButtonState>
	>({});

	async function handleRetrigger(
		jobId: number,
		temporalUnit: StatsTemporalUnit
	) {
		const key = retriggerButtonKey(jobId, temporalUnit);
		setButtonStates((previous) => ({
			...previous,
			[key]: { kind: 'pending' }
		}));
		const result = await regenerateStatsCache({ temporalUnit });
		setButtonStates((previous) => ({
			...previous,
			[key]: result.success
				? { kind: 'retriggered' }
				: { kind: 'error', message: result.error }
		}));
	}

	return (
		<PageWrapper>
			<PrimaryHeading>Stats consistency</PrimaryHeading>
			{data.importJobs.length === 0 ? (
				<p className="text-base-content/70">No import jobs yet.</p>
			) : (
				<Table>
					<thead>
						<tr>
							<th scope="col">Started</th>
							<th scope="col">Status</th>
							<th scope="col">Rows processed</th>
							<th scope="col">Rows successful</th>
							<th scope="col">Rows failed</th>
							{REFRESH_COLUMNS.map(({ temporalUnit }) => (
								<th scope="col" key={temporalUnit}>
									{temporalUnitNameMapping[temporalUnit]}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{data.importJobs.map((job) => (
							<tr key={job.id}>
								<td>
									{formatDate(new Date(job.started_at), 'd MMM yyyy HH:mm')}
								</td>
								<td>{job.status}</td>
								<td>{formatRowCount(job.rows_processed)}</td>
								<td>{formatRowCount(job.rows_successful)}</td>
								<td>{formatRowCount(job.rows_failed)}</td>
								{REFRESH_COLUMNS.map(({ key, temporalUnit }) => {
									const status: ImportJobStatus = job[key];
									if (status === 'succeeded') {
										return <td key={temporalUnit}>{status}</td>;
									}
									const buttonKey = retriggerButtonKey(job.id, temporalUnit);
									const buttonState: RetriggerButtonState = buttonStates[
										buttonKey
									] ?? { kind: 'idle' };
									const isDisabled =
										buttonState.kind === 'pending' ||
										buttonState.kind === 'retriggered';
									return (
										<td key={temporalUnit}>
											<div className="flex items-center gap-2">
												<span>{status}</span>
												<button
													type="button"
													className="btn btn-xs"
													disabled={isDisabled}
													onClick={() => handleRetrigger(job.id, temporalUnit)}
												>
													{buttonState.kind === 'pending'
														? 'Retriggering…'
														: 'Retrigger'}
												</button>
												{buttonState.kind === 'retriggered' && (
													<span>Retriggered</span>
												)}
												{buttonState.kind === 'error' && (
													<span role="alert" className="text-error text-sm">
														{buttonState.message}
													</span>
												)}
											</div>
										</td>
									);
								})}
							</tr>
						))}
					</tbody>
				</Table>
			)}
			<StatsCacheDiscrepanciesReport speciesNamesById={data.speciesNamesById} />
		</PageWrapper>
	);
}
