import { vi } from 'vitest';

/**
 * Shared `vi.mock(...)` declarations for every `Sp*Tab` component rendered by
 * the species-page test family (`app/(routes)/species/[speciesName]/__tests__/page.test.tsx`
 * and its `[year]`/`[year]/[month]` siblings). Each of those three files
 * exercises a different subset of this same set of components, all stubbed
 * the same way — a `data-testid` div standing in for the real (heavier) tab
 * content, which these page-level tests don't need to render.
 *
 * `vi.mock(...)` calls only hoist above the *other statements in the file
 * that calls them* (the same constraint `group-scope-delegation.ts` notes for
 * module paths) — they can't be wrapped in a callable helper function and
 * invoked later, since by then the real module has already been imported.
 * So this file mocks every component directly at its own top level, and each
 * test file pulls it in with a side-effect-only `import` placed before any
 * import that would otherwise load the real components (i.e. before the
 * `Page` import) — that ordering is what makes the mocks take effect.
 */

vi.mock('@/app/components/pages/species/SpIndividualsTab', () => ({
	SpIndividualsTab: () => <div data-testid="sp-individuals-tab" />
}));

vi.mock('@/app/components/pages/species/SpNotableRetrapsTab', () => ({
	SpNotableRetrapsTab: () => <div data-testid="sp-notable-retraps-tab" />
}));

vi.mock('@/app/components/pages/species/SpDemographicsTab', () => ({
	SpDemographicsTab: () => <div data-testid="sp-demographics-tab" />
}));

vi.mock('@/app/components/pages/species/SpBiometricsTab', () => ({
	SpBiometricsTab: () => <div data-testid="sp-biometrics-tab" />
}));

vi.mock('@/app/components/pages/species/SpYearTotalsTab', () => ({
	SpYearTotalsTab: () => <div data-testid="sp-year-totals-tab" />
}));

vi.mock('@/app/components/pages/species/SpCombinedMonthTotalsTab', () => ({
	SpCombinedMonthTotalsTab: () => (
		<div data-testid="sp-combined-month-totals-tab" />
	)
}));

vi.mock('@/app/components/pages/species/SpSessionTotalsTab', () => ({
	SpSessionTotalsTab: () => <div data-testid="sp-session-totals-tab" />
}));

vi.mock('@/app/components/pages/species/SpStatsHistoryTab', () => ({
	SpStatsHistoryTab: () => <div data-testid="sp-stats-history-tab" />
}));

vi.mock('@/app/components/pages/species/SpMonthTotalsTab', () => ({
	SpMonthTotalsTab: () => <div data-testid="sp-month-totals-tab" />
}));

vi.mock('@/app/components/pages/species/SpWeightWingTab', () => ({
	SpWeightWingTab: () => <div data-testid="sp-weight-wing-tab" />
}));
