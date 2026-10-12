'use client';
import { useState } from 'react';
import type { Json } from '@/types/supabase.types';

// Toggles visibility of a report's raw highlight_body JSON on the
// _highlights admin page — hidden by default since it's rarely needed and
// is noisy to scan past. Owns its own open/closed state, mirroring
// ReportHighlightButton.tsx's self-contained-toggle shape.
export function HighlightReportBody({
	highlightBody
}: {
	highlightBody: Json;
}) {
	const [isVisible, setIsVisible] = useState(false);

	return (
		<div>
			<button
				type="button"
				className="btn btn-xs btn-ghost"
				onClick={() => setIsVisible((visible) => !visible)}
			>
				{isVisible ? 'Hide config' : 'Show config'}
			</button>
			{isVisible && (
				<pre className="text-xs whitespace-pre-wrap">
					{JSON.stringify(highlightBody, null, 2)}
				</pre>
			)}
		</div>
	);
}
