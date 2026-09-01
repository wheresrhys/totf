'use client';
import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
	promoteControlToSequence,
	type PromoteControlState
} from '@/app/actions/ring-sequences';

// First 3 characters of a ring number, matching the server action's prefix
// derivation, so the modal names the same prefix the promote will actually
// track.
function ringPrefix(ringNo: string): string {
	return ringNo.slice(0, 3);
}

// Confirmation modal for promoting a control ring to a tracked ring sequence.
// Mirrors `RingSequenceEditModal` / `LoginModal`: a `useActionState`-driven
// form with hidden inputs, a spinner while pending, and an inline error that
// keeps the modal open on failure. On success it refreshes the route (so
// every control sharing this prefix — not just the clicked ring — drops off
// the controls list) and closes.
export function CreateSequenceForRing({
	ringNo,
	viewedGroupId,
	onClose
}: {
	ringNo: string;
	viewedGroupId: number;
	onClose: () => void;
}) {
	const router = useRouter();
	const [state, action, isPending] = useActionState<
		PromoteControlState,
		FormData
	>(promoteControlToSequence, null);

	useEffect(() => {
		if (state?.success) {
			router.refresh();
			onClose();
		}
	}, [state, router, onClose]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			data-testid="promote-control-modal"
		>
			<div className="bg-base-100 rounded-box shadow-xl p-6 w-full max-w-sm">
				<h2 className="font-bold text-lg mb-4">Promote to sequence</h2>
				<p className="mb-4">
					Promote ring <span className="font-bold">{ringNo}</span> to a tracked
					ring sequence for prefix{' '}
					<span className="font-bold">{ringPrefix(ringNo)}</span>? Every control
					with this prefix will move to the sequence and no longer appear here.
				</p>
				<form action={action} className="flex flex-col gap-4">
					<input type="hidden" name="ring_no" value={ringNo} />
					<input type="hidden" name="viewed_group_id" value={viewedGroupId} />
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
