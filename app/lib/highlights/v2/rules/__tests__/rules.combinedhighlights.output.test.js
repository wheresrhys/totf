import { describe, it, expect } from 'vitest';

import { highlightRules } from '../';
import { expectations as allExpectations } from './expectations';
import { getCombinedHighlightFixtures } from './fixture-generator';

describe('rules output for comibned highlights', () => {
	highlightRules.forEach((rule) => {
		describe(rule.descriptor.type, () => {
			const combinedHighlightFixtures = rule.descriptor.type.startsWith(
				'eachSpecies'
			)
				? getCombinedHighlightFixtures(true)
				: getCombinedHighlightFixtures(false);
			const expectations = allExpectations[rule.descriptor.type];
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
});
