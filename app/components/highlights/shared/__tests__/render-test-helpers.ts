import type { ReactElement } from 'react';

// Test-only counterpart to `../render-sentence.tsx` (shared formatting
// helpers used by the renderers themselves). Shared by each group's
// `renderers.test.tsx` (counts/rarities/vital-stats) to avoid redefining
// this identical boilerplate in each one.

// Overrides for a highlight's per-family factory — every field bar the
// fixed `type` discriminant.
export type HighlightFields<T extends { type: string }> = Omit<T, 'type'>;

// Each highlight renders <li key={sentence}>{sentence}</li>; the copy tests
// assert on the sentence text.
export function renderedText<T>(
	renderFn: (highlight: T) => ReactElement,
	highlight: T
): string {
	return (renderFn(highlight).props as { children: string }).children;
}
