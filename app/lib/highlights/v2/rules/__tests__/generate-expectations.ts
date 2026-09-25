import {highlightRules} from '../';
import {getFixtures} from './fixture-generator';
import type {
  CombinedHighlight
} from '../../types';
highlightRules.forEach(rule => {
  const fixtures = rule.descriptor.type.startsWith('eachSpecies') ? getFixtures(true) : getFixtures(false);

  Object.entries(fixtures).forEach(([name, fixture]) => {
    console.log(rule.formatters.combinedHighlightPrinter(fixture as CombinedHighlight))
  })
})
