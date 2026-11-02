import { describe, it, expect } from 'vitest';

import { highlightRules } from '../../lib/rule-registry';
import { expectations as allExpectations } from './expectations';
import { getCombinedHighlightFixtures } from './fixture-generator';
import type { CombinedHighlight } from '../../types';

describe('rules output for combined highlights', () => {
	highlightRules.forEach((rule) => {
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
