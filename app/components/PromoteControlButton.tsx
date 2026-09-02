'use client';
import { useState } from 'react';
import { CreateSequenceForRing } from './CreateSequenceForRing';

// Row-level "Promote to sequence" action for the /controls table. Owns the
// open/closed state of its own confirmation modal so `ControlsPageContent`
// (which renders the table server-side) doesn't need `useState` itself —
// only this button and the modal it opens are client components.
export function PromoteControlButton({
	ringNo,
	viewedGroupId
}: {
	ringNo: string;
	viewedGroupId: number;
}) {
	const [isPromoting, setIsPromoting] = useState(false);

	return (
		<>
			<button
				type="button"
				className="btn btn-xs btn-outline"
				data-testid={`promote-control-${ringNo}`}
				onClick={() => setIsPromoting(true)}
			>
				Promote to sequence
			</button>
			{isPromoting && (
				<CreateSequenceForRing
					ringNo={ringNo}
					viewedGroupId={viewedGroupId}
					onClose={() => setIsPromoting(false)}
				/>
			)}
		</>
	);
}
