'use client';
import { useState } from 'react';
import { ReportHighlightModal } from './ReportHighlightModal';
import type { CombinedHighlight } from '@/app/lib/highlights/types';

// Per-highlight "Report" action (#1122). Owns the open/closed state of its own
// confirmation modal, mirroring PromoteControlButton.tsx, so the server-rendered
// highlight list doesn't need useState itself.
export function ReportHighlightButton({
	highlight,
	displayedText
}: {
	highlight: CombinedHighlight;
	displayedText: string;
}) {
	const [isReporting, setIsReporting] = useState(false);

	return (
		<>
			<button
				type="button"
				className="btn btn-xs btn-ghost"
				onClick={() => setIsReporting(true)}
			>
				Report
			</button>
			{isReporting && (
				<ReportHighlightModal
					highlight={highlight}
					displayedText={displayedText}
					onClose={() => setIsReporting(false)}
				/>
			)}
		</>
	);
}
