'use client';
import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
	dismissHighlightReport,
	type DismissHighlightReportState
} from '@/app/actions/highlight-reports';

// Per-report "Dismiss" action on the _highlights admin page. No confirmation
// modal (unlike ReportHighlightButton/CreateSequenceForRing) — dismissal is
// low-stakes and reversible in the database (it only flips is_dismissed, a
// row is never deleted) — so this just submits inline and refreshes the
// route on success, dropping the dismissed report out of the server-fetched
// list.
export function DismissHighlightReportButton({
	reportId
}: {
	reportId: number;
}) {
	const router = useRouter();
	const [state, action, isPending] = useActionState<
		DismissHighlightReportState,
		FormData
	>(dismissHighlightReport, null);

	useEffect(() => {
		if (state?.success) {
			router.refresh();
		}
	}, [state, router]);

	return (
		<form action={action} className="flex flex-col items-end gap-1">
			<input type="hidden" name="reportId" value={reportId} />
			<button
				type="submit"
				className="btn btn-xs btn-outline"
				disabled={isPending}
			>
				{isPending ? (
					<span className="loading loading-spinner loading-xs" />
				) : (
					'Dismiss'
				)}
			</button>
			{state && !state.success && (
				<p className="text-error text-xs">{state.error}</p>
			)}
		</form>
	);
}
