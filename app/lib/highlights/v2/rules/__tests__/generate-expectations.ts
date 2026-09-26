import { highlightRules } from '../';
import {
	getCombinedHighlightFixtures,
	isPerSpeciesRule
} from './fixture-generator';
import type { CombinedHighlight } from '../../types';
import { writeFileSync } from 'node:fs';

const fixtures = Object.fromEntries(
	highlightRules.map((rule) => {
		const fixtures = getCombinedHighlightFixtures(isPerSpeciesRule(rule));

		const fixture = Object.fromEntries(
			Object.entries(fixtures).map(([name, fixture]) => [
				name,
				rule.formatters.combinedHighlightPrinter(fixture as CombinedHighlight)
			])
		);
		return [rule.descriptor.type, fixture];
	})
);

writeFileSync(
	'./app/lib/highlights/v2/rules/__tests__/expectations.ts',
	`export const expectations = ${JSON.stringify(fixtures, null, '\t')}`
);
