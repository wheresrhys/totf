import { highlightRules } from '..';
import { getCombinedHighlightFixtures } from './fixture-generator';
import type { CombinedHighlight } from '../../types';
import { writeFileSync } from 'node:fs';

const fixtures = Object.fromEntries(
	highlightRules.map((rule) => {
		const combinedHighlights = getCombinedHighlightFixtures(rule);

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
				)
			}
		];
	})
);

writeFileSync(
	'./app/lib/highlights/rules/__tests__/expectations.ts',
	`export const expectations = ${JSON.stringify(fixtures, null, '\t')}`
);
