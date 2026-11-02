import { describe, it, expect } from 'vitest';

import { highlightRules } from '../../lib/rule-registry';
import { expectations as allExpectations } from './expectations';
import { getCombinedHighlightFixtures } from './fixture-generator';
import type { CombinedHighlight } from '../../types';

describe('rules output for combined highlights', () => {
	highlightRules.forEach((rule) => {
		// rarities is excluded here: this shared matrix builds fixtures around
		// rank/tie/time-window variants that matter for a "busiest X" count
		// metric, but rarities' generator never produces that shape (its value
		// is always 'Only' | 'first of only N' | 'N of only M') — the fixtures
		// this matrix would build for it, and the expectations that follow from
		// them, describe nothing a real rarities highlight could look like.
		// rarities' own printer gets hand-crafted, shape-appropriate fixtures in
		// rarities.test.ts instead.
		if (rule.descriptor.type === 'rarities') return;

		describe(rule.descriptor.type, () => {
			describe('combined highlight printers', () => {
				const combinedHighlightFixtures = getCombinedHighlightFixtures(rule);

				const expectations = (
					allExpectations as Record<
						string,
						{ printedCombinedHighlights: Record<string, string> }
					>
				)[rule.descriptor.type].printedCombinedHighlights;
				Object.entries(combinedHighlightFixtures).map(
					([testCase, combinedHighlight]) => {
						it(testCase, () => {
							expect(
								rule.formatters.combinedHighlightPrinter(
									combinedHighlight as CombinedHighlight
								)
							).toEqual(expectations[testCase]);
						});
					}
				);
			});
		});
	});
});
