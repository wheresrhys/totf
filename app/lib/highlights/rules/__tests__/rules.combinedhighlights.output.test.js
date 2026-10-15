import { describe, it, expect } from 'vitest';

import { highlightRules } from '../';
import { expectations as allExpectations } from './expectations';
import { getCombinedHighlightFixtures } from './fixture-generator';

describe('rules output for combined highlights', () => {
	highlightRules.forEach((rule) => {
		if (rule.descriptor.type !== 'rarities') {
			describe(rule.descriptor.type, () => {
				describe('combined highlight printers', () => {
					const combinedHighlightFixtures = getCombinedHighlightFixtures(rule);

					const expectations =
						allExpectations[rule.descriptor.type].printedCombinedHighlights;
					Object.entries(combinedHighlightFixtures).map(
						([testCase, combinedHighlight]) => {
							it(testCase, () => {
								expect(
									rule.formatters.combinedHighlightPrinter(combinedHighlight)
								).toEqual(expectations[testCase]);
							});
						}
					);
				});
			});
		}
	});
});
