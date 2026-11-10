'use client';
import { useState } from 'react';
import { regenerateStatsCache } from '@/app/actions/regenerate-stats-cache';
import {
	buildFixDispatchParams,
	discrepancyRowFixButtonKinds,
	DISCREPANCY_ROW_FIX_BUTTON_LABELS,
	type DiscrepancyRowFixButtonKind,
	type DiscrepancyRowScope,
	type StatsCacheFixDispatch
} from './discrepancy-row-fix-scope';

type FixButtonsState =
	| { kind: 'idle' }
	| { kind: 'pending' }
	| { kind: 'error'; message: string };

/**
 * The 2 (overall row) or 4 (by-species row) "fix" buttons #1390 attaches to
 * each of the discrepancy report's rows. Each one calls `regenerateStatsCache`
 * (#1380's already-merged action) with the clicked row's scope widened per
 * `buildFixDispatchParams`, disabling the whole row's buttons while the call
 * is in flight so a double-click can't dispatch twice, and showing the error
 * inline on a failure — the same pending/disabled-plus-inline-error shape
 * `DismissHighlightReportButton` and this page's own "Retrigger" buttons use.
 *
 * `isFixRequested` is owned by the list above, not here: a successful dispatch
 * covers other rendered rows too (see
 * `isDiscrepancyRowCoveredByFixDispatch`), so the flag has to be derived from
 * every dispatch the page has made, not from this row's own clicks.
 *
 * **"Fix requested" is a page-session-only optimistic flag, not a
 * server-verified "fixed" outcome, and there is deliberately no polling or
 * refetch behind it.** `regenerateStatsCache` is fire-and-forget onto the
 * stats-cache refresh queue — its `success: true` means "accepted and queued",
 * not "finished" — and it exposes no completion signal to poll. So a row that
 * has been fixed never re-checks itself and is never removed from the list; it
 * just stays disabled until the user reloads the page, at which point the
 * report's own live-vs-cache comparison re-runs and the row either reappears
 * (still discrepant) or disappears (actually fixed) on its own.
 */
export function DiscrepancyRowFixButtons({
	row,
	isFixRequested,
	onFixRequested
}: {
	row: DiscrepancyRowScope;
	isFixRequested: boolean;
	onFixRequested: (dispatch: StatsCacheFixDispatch) => void;
}) {
	const [state, setState] = useState<FixButtonsState>({ kind: 'idle' });

	async function handleClick(buttonKind: DiscrepancyRowFixButtonKind) {
		const dispatch = buildFixDispatchParams(row, buttonKind);
		setState({ kind: 'pending' });
		const result = await regenerateStatsCache(dispatch);
		if (result.success) {
			setState({ kind: 'idle' });
			onFixRequested(dispatch);
		} else {
			setState({ kind: 'error', message: result.error });
		}
	}

	const isDisabled = isFixRequested || state.kind === 'pending';

	return (
		<div className="flex flex-wrap items-center gap-1">
			{isFixRequested && <span className="text-sm">Fix requested</span>}
			{discrepancyRowFixButtonKinds(row).map((buttonKind) => (
				<button
					key={buttonKind}
					type="button"
					className="btn btn-xs"
					disabled={isDisabled}
					onClick={() => handleClick(buttonKind)}
				>
					{DISCREPANCY_ROW_FIX_BUTTON_LABELS[buttonKind]}
				</button>
			))}
			{state.kind === 'error' && (
				<span role="alert" className="text-error text-sm">
					{state.message}
				</span>
			)}
		</div>
	);
}
