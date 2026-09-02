'use client';
import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
	createSequenceFromImportPrefix,
	type CreateSequenceFromPrefixState
} from '@/app/actions/ring-sequences';
import { deriveRingBounds } from '@/app/models/ring-sequences';

// Confirmation modal for creating a ring sequence from an unassigned import
// prefix (issue #697). Mirrors `CreateSequenceForRing` / `RingSequenceEditModal`:
// a `useActionState`-driven form with hidden inputs, a spinner while pending,
// and an inline error that keeps the modal open on failure. It shows every ring
// number sharing the prefix and pre-fills `first_ring`/`last_ring` with the
// bounds `deriveRingBounds` suggests (the user can adjust them before
// confirming). On success it refreshes the route (so the prefix drops off the
// list and its new sequence appears) and closes.
export function CreateSequenceFromPrefix({
	prefix,
	ringNos,
	viewedGroupId,
	onClose
}: {
	prefix: string;
	ringNos: string[];
	viewedGroupId: number;
	onClose: () => void;
}) {
	const router = useRouter();
	const [state, action, isPending] = useActionState<
		CreateSequenceFromPrefixState,
		FormData
	>(createSequenceFromImportPrefix, null);
	const suggested = deriveRingBounds(ringNos);

	useEffect(() => {
		if (state?.success) {
			router.refresh();
			onClose();
		}
	}, [state, router, onClose]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 text-wrap"
			data-testid="create-sequence-from-prefix-modal"
		>
			<div className="bg-base-100 rounded-box shadow-xl p-6 w-full max-w-md">
				<h2 className="font-bold text-lg mb-4">Create ring sequence</h2>
				<p className="mb-2">
					Create a tracked ring sequence for prefix{' '}
					<span className="font-bold">{prefix}</span>, covering{' '}
					<span className="font-bold">{ringNos.length}</span> unassigned ring
					{ringNos.length === 1 ? '' : 's'}. Every matching bird will be linked
					to the new sequence.
				</p>
				<ul
					className="mb-4 max-h-40 overflow-y-auto text-sm font-mono"
					data-testid="prefix-ring-list"
				>
					{ringNos.map((ringNo) => (
						<li key={ringNo}>{ringNo}</li>
					))}
				</ul>
				<form action={action} className="flex flex-col gap-4">
					<input type="hidden" name="prefix" value={prefix} />
					<input type="hidden" name="viewed_group_id" value={viewedGroupId} />
					<label className="flex flex-col gap-1">
						<span className="text-sm">First ring</span>
						<input
							type="text"
							name="first_ring"
							defaultValue={suggested?.first_ring ?? ''}
							className="input input-bordered w-full"
							placeholder="First ring"
						/>
					</label>
					<label className="flex flex-col gap-1">
						<span className="text-sm">Last ring</span>
						<input
							type="text"
							name="last_ring"
							defaultValue={suggested?.last_ring ?? ''}
							className="input input-bordered w-full"
							placeholder="Last ring"
						/>
					</label>
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
								'Create sequence'
							)}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
