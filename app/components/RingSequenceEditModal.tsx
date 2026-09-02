'use client';
import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
	updateRingSequence,
	type UpdateRingSequenceState
} from '@/app/actions/ring-sequences';
import { RING_SIZE_ENUM_ORDER } from '@/app/models/ring-sequences';
import type { RingSequenceRow } from '@/app/models/db';

export function RingSequenceEditModal({
	sequence,
	onClose
}: {
	sequence: RingSequenceRow;
	onClose: () => void;
}) {
	const router = useRouter();
	const [state, action, isPending] = useActionState<
		UpdateRingSequenceState,
		FormData
	>(updateRingSequence, null);

	useEffect(() => {
		if (state?.success) {
			router.refresh();
			onClose();
		}
	}, [state, router, onClose]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			data-testid="ring-sequence-edit-modal"
		>
			<div className="bg-base-100 rounded-box shadow-xl p-6 w-full max-w-sm">
				<h2 className="font-bold text-lg mb-4">Edit ring sequence</h2>
				<form action={action} className="flex flex-col gap-4">
					<input type="hidden" name="id" value={sequence.id} />
					<div className="flex flex-col gap-1">
						<span className="text-sm">Prefix</span>
						<span className="font-mono">{sequence.prefix}</span>
					</div>
					<label className="flex flex-col gap-1">
						<span className="text-sm">Ring size</span>
						<select
							name="size"
							defaultValue={sequence.size ?? ''}
							className="select select-bordered w-full"
						>
							<option value="">— Select size —</option>
							{RING_SIZE_ENUM_ORDER.map((size) => (
								<option key={size} value={size}>
									{size}
								</option>
							))}
						</select>
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
								'Save'
							)}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
