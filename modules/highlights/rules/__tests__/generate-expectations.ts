import { highlightRules } from '../../lib/rule-registry';
import { getCombinedHighlightFixtures } from './fixture-generator';
import type { CombinedHighlight } from '../../types';
import { writeFileSync } from 'node:fs';

// rarities is excluded: the generic fixture matrix below describes rank/tie/
// time-window variants that make sense for a "busiest X" count metric, but
// rarities' generator never produces those shapes (its value is always
// 'Only' | 'first of only N' | 'N of only M') — running it through this
// matrix produces fixtures the real generator could never emit, and
// expectations that describe nothing meaningful. rarities' printer gets its
// own hand-crafted fixtures/expectations in rarities.test.ts instead.
const fixtures = Object.fromEntries(
	highlightRules
		.filter((rule) => rule.descriptor.type !== 'rarities')
		.map((rule) => {
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
	'./modules/highlights/rules/__tests__/expectations.ts',
	`export const expectations = ${JSON.stringify(fixtures, null, '\t')}`
);
