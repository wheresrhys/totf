import type { SessionHighlight } from '@/app/models/session-highlights';

// Rem-1: a "Busiest session since <date>" comparison is redundant once the
// session already holds a busiest (encounters) session-total record — the
// record is the stronger, more specific claim.
export function removeBusiestSinceWhenBusiestRecordHeld(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	const holdsBusiestRecord = highlights.some(
		(highlight) =>
			highlight.type === 'session-total-record' &&
			highlight.metric === 'encounters'
	);
	if (!holdsBusiestRecord) return highlights;
	return highlights.filter(
		(highlight) =>
			!(highlight.type === 'since-comparison' && highlight.kind === 'busiest')
	);
}
