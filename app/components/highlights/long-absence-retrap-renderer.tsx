import type { ReactElement } from 'react';
import type { LongAbsenceRetrapHighlight } from '@/app/models/highlights';
import {
	formatShortDate,
	renderSentence
} from '@/app/components/highlights/shared/render-sentence';

// A sibling of the three group renderer directories, mirroring
// app/models/highlights/long-absence-retrap.ts's own sibling status — see
// docs/session-highlight-ordering.md. Not folded into any group and not
// re-exported from ./index.ts: it's the seed for a future standalone
// "Notable retraps" section (per #408's comment thread), not yet wired into
// any page.

function buildLongAbsenceRetrapSentence(
	highlight: LongAbsenceRetrapHighlight
): string {
	const yearsPart = `${highlight.gapYears} ${highlight.gapYears === 1 ? 'year' : 'years'}`;
	const gapPhrase =
		highlight.gapMonths === 0
			? yearsPart
			: `${yearsPart}, ${highlight.gapMonths} ${highlight.gapMonths === 1 ? 'month' : 'months'}`;
	return `${highlight.speciesName} ${highlight.ringNo} recaught after ${gapPhrase} away (last seen ${formatShortDate(highlight.previousDate)})`;
}

export function renderLongAbsenceRetrapHighlight(
	highlight: LongAbsenceRetrapHighlight
): ReactElement {
	return renderSentence(buildLongAbsenceRetrapSentence(highlight));
}
