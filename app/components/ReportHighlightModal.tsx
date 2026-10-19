'use client';
import { useActionState, useEffect } from 'react';
import {
	reportHighlight,
	type ReportHighlightState
} from '@/app/actions/highlight-reports';
import type { CombinedHighlight } from '@/app/lib/highlights/types';

// Confirmation modal for reporting a bad highlight (#1122). Mirrors
// CreateSequenceForRing.tsx: a useActionState-driven form with hidden inputs,
// a spinner while pending, and an inline error that keeps the modal open on
// failure. On success it just closes — nothing on the page needs to change.
export function ReportHighlightModal({
	highlight,
	displayedText,
	onClose
}: {
	highlight: CombinedHighlight;
	displayedText: string;
	onClose: () => void;
}) {
	const [state, action, isPending] = useActionState<
		ReportHighlightState,
		FormData
	>(reportHighlight, null);

	useEffect(() => {
		if (state?.success) {
			onClose();
		}
	}, [state, onClose]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 text-wrap"
			data-testid="report-highlight-modal"
		>
			<div className="bg-base-100 rounded-box shadow-xl p-6 w-full max-w-sm">
				<h2 className="font-bold text-lg mb-4">Report highlight</h2>
				<p className="mb-4">{displayedText}</p>
				<form action={action} className="flex flex-col gap-4">
					<input
						type="hidden"
						name="pageUrl"
						value={typeof window !== 'undefined' ? window.location.href : ''}
					/>
					<input type="hidden" name="highlightText" value={displayedText} />
					<input
						type="hidden"
						name="highlightBody"
						value={JSON.stringify(highlight, null, 2)}
					/>
					<textarea
						name="reason"
						className="textarea textarea-bordered"
						placeholder="What's wrong with this highlight?"
						required
					/>
					{state && !state.success && (
						<p className="text-error text-sm">{state.error}</p>
					)}
					<div className="flex justify-end gap-2">
						<button
							type="button"
							className="btn btn-ghost"
							onClick={onClose}
							disabled={isPending}
						>
							Cancel
						</button>
						<button
							type="submit"
							className="btn btn-primary"
							disabled={isPending}
						>
							{isPending ? (
								<span className="loading loading-spinner loading-sm" />
							) : (
								'Confirm'
							)}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
