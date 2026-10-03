import { highlightRules } from '..';
import {
	getCombinedHighlightFixtures,
	getHighlightsOfTypeFixtures
} from './fixture-generator';
import type { CombinedHighlight, HighlightsOfType } from '../../types';
import { writeFileSync } from 'node:fs';

const fixtures = Object.fromEntries(
	highlightRules.map((rule) => {
		const combinedHighlights = getCombinedHighlightFixtures(rule);
		const highlightsOfType = getHighlightsOfTypeFixtures(rule);

		return [
			rule.descriptor.type,
			{
				printedCombinedHighlights: Object.fromEntries(
					Object.entries(combinedHighlights).map(([name, fixture]) => [
						name,
						rule.formatters.combinedHighlightPrinter(
							fixture as CombinedHighlight
						)
					])
				),
				printedHighlightsOfType: Object.fromEntries(
					Object.entries(highlightsOfType).map(([name, fixture]) => [
						name,
						rule.formatters.highlightListPrefixPrinter(
							fixture as HighlightsOfType
						)
					])
				)
			}
		];
	})
);

writeFileSync(
	'./app/lib/highlights/rules/__tests__/expectations.ts',
	`export const expectations = ${JSON.stringify(fixtures, null, '\t')}`
);
