import { vi } from 'vitest';

/**
 * Shared `vi.mock(...)` declarations for every `Sp*Tab` component rendered by
 * the species-page test family (`app/(routes)/species/[speciesName]/__tests__/page.test.tsx`
 * and its `[yearOrMonth]`/`[yearOrMonth]/[month]` siblings). Each of those three files
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

// These 3 render their received props as JSON text (rather than an empty
// stub like every other mock below) so a test can assert a `TabConfig`
// adapter mapped them correctly — see `PageContent.test.tsx`'s "species
// detail tabs" describe block (#1060), which is the only current consumer of
// this. `JSON.parse(element.textContent)` recovers the props object.
vi.mock('@/app/components/pages/species/SpIndividualsTab', () => ({
	SpIndividualsTab: (props: Record<string, unknown>) => (
		<div data-testid="sp-individuals-tab">{JSON.stringify(props)}</div>
	)
}));

vi.mock('@/app/components/pages/species/SpHighlightsTab', () => ({
	SpHighlightsTab: () => <div data-testid="sp-highlights-tab" />,
	// `buildSpeciesTotalsTabs` (`species-tabs.ts`) imports the whole
	// `TabConfig` object, not just the bare component — see
	// `SpHighlightsTab.tsx`'s own doc comment on why its `dataFetcher` is
	// assembled there rather than in `app/actions/sp-data.ts`.
	spHighlightsTab: {
		id: 'highlights',
		label: 'Highlights',
		clientSideOnly: true,
		dataFetcher: vi.fn().mockResolvedValue(null),
		TabComponent: () => <div data-testid="sp-highlights-tab" />
	}
}));

vi.mock('@/app/components/pages/species/SpDemographicsTab', () => ({
	SpDemographicsTab: (props: Record<string, unknown>) => (
		<div data-testid="sp-demographics-tab">{JSON.stringify(props)}</div>
	)
}));

vi.mock('@/app/components/pages/species/SpBiometricsTab', () => ({
	SpBiometricsTab: (props: Record<string, unknown>) => (
		<div data-testid="sp-biometrics-tab">{JSON.stringify(props)}</div>
	)
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

vi.mock('@/app/components/pages/species/SpSquashedMonthYearTotalsTab', () => ({
	SpSquashedMonthYearTotalsTab: () => (
		<div data-testid="sp-squashed-month-year-totals-tab" />
	)
}));

vi.mock('@/app/components/pages/species/SpWeightWingTab', () => ({
	SpWeightWingTab: () => <div data-testid="sp-weight-wing-tab" />
}));
