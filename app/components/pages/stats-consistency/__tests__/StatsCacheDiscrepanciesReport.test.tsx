import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor,
	within,
	act
} from '@testing-library/react';
import { StatsCacheDiscrepanciesReport } from '../StatsCacheDiscrepanciesReport';
import {
	fetchStatsCacheDiscrepancies,
	type FetchStatsCacheDiscrepanciesParams
} from '@/app/actions/stats-cache-discrepancies';
import type { FetchStatsCacheDiscrepanciesResult } from '@/app/actions/stats-cache-discrepancies';
import {
	DISCREPANCY_SCOPES,
	EAGER_DISCREPANCY_SCOPES,
	discrepancyScopeKey,
	discrepancyScopeHeading,
	discrepancyItemLabel,
	type DiscrepancyScope
} from '../discrepancy-scopes';
import { regenerateStatsCache } from '@/app/actions/regenerate-stats-cache';
import type { StatsCacheDiscrepancy } from '@/modules/stats';

vi.mock('@/app/actions/stats-cache-discrepancies', () => ({
	fetchStatsCacheDiscrepancies: vi.fn()
}));

vi.mock('@/app/actions/regenerate-stats-cache', () => ({
	regenerateStatsCache: vi.fn()
}));

// A hand-built discrepancy fixture filling in only the columns these tests
// actually read, not a full `SimpleMergedCell` — the documented exception to
// the "try `as Type` first" rule (see app/CLAUDE.md's testing conventions).
type DiscrepancyFixtureOverrides = {
	species_id?: number | null;
	time_period?: string | null;
	cachedRow?: Record<string, unknown> | null;
	liveRow?: Record<string, unknown> | null;
	mismatchedFields?: string[];
};

function buildDiscrepancy(
	overrides: DiscrepancyFixtureOverrides = {}
): StatsCacheDiscrepancy {
	// eslint-disable-next-line no-restricted-syntax -- hand-built fixture filling in only the columns these tests read
	return {
		species_id: null,
		time_period: '2026-01-01',
		cachedRow: { session_count: 5 },
		liveRow: { session_count: 7 },
		mismatchedFields: ['session_count'],
		...overrides
	} as unknown as StatsCacheDiscrepancy;
}

/**
 * Routes the mocked `fetchStatsCacheDiscrepancies` to a per-scope result,
 * keyed by `discrepancyScopeKey` — every scope not named in `overrides`
 * defaults to "no discrepancies found". The report now resolves its own
 * eager scopes by calling this same action client-side (one at a time,
 * after mount) rather than taking a pre-fetched prop, so every test that
 * cares about a specific scope's result routes it through here instead of
 * building a `DiscrepancyScopeResults` object to pass as a prop.
 */
function mockScopedResults(
	overrides: Partial<Record<string, FetchStatsCacheDiscrepanciesResult>> = {}
) {
	vi.mocked(fetchStatsCacheDiscrepancies).mockImplementation(
		async (params: FetchStatsCacheDiscrepanciesParams) => {
			const key = discrepancyScopeKey({
				temporalUnit: params.temporalUnit,
				bySpecies: params.bySpecies
			});
			return overrides[key] ?? { success: true, discrepancies: [] };
		}
	);
}

function renderReport(
	overrides: {
		speciesNamesById?: Record<number, string>;
	} = {}
) {
	return render(
		<StatsCacheDiscrepanciesReport
			speciesNamesById={overrides.speciesNamesById ?? {}}
		/>
	);
}

function getScopeSection(scope: DiscrepancyScope) {
	return screen.getByTestId(`discrepancy-scope-${discrepancyScopeKey(scope)}`);
}

function withResult(
	scope: DiscrepancyScope,
	result: FetchStatsCacheDiscrepanciesResult
): Partial<Record<string, FetchStatsCacheDiscrepanciesResult>> {
	return { [discrepancyScopeKey(scope)]: result };
}

describe('StatsCacheDiscrepanciesReport', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockScopedResults();
		vi.mocked(regenerateStatsCache).mockResolvedValue({ success: true });
	});

	afterEach(() => {
		cleanup();
	});

	// Every test below mounts the full report, which unconditionally kicks off
	// its 6 eager-scope fetches on mount. A test asserting pre-resolution state
	// (e.g. the "Checking…" loading text) has to check that *before* letting
	// the chain settle; `flushEagerFetches` drains it afterwards so the
	// resulting state updates happen inside `waitFor`'s act()-wrapped polling
	// rather than leaking out after the test body returns (which is what
	// produces a "not wrapped in act(...)" warning for an update React can
	// genuinely no longer attribute to anything the test is still watching).
	async function flushEagerFetches() {
		await waitFor(() => {
			expect(fetchStatsCacheDiscrepancies).toHaveBeenCalledTimes(
				EAGER_DISCREPANCY_SCOPES.length
			);
		});
	}

	describe('scope ordering', () => {
		it('renders the 10 scopes in all-time, year, month-squashed, month, day order, combined pass then by-species pass', async () => {
			renderReport();

			const headings = screen
				.getAllByRole('heading', { level: 3 })
				.map((heading) => heading.textContent);

			expect(headings).toEqual(DISCREPANCY_SCOPES.map(discrepancyScopeHeading));

			await flushEagerFetches();
		});
	});

	describe('eager scopes (all-time, year, month-squashed)', () => {
		it('shows a loading state before the client-side check resolves', async () => {
			const scope: DiscrepancyScope = {
				temporalUnit: 'year',
				bySpecies: false
			};
			renderReport();

			expect(
				within(getScopeSection(scope)).getByText('Checking…')
			).toBeTruthy();

			await flushEagerFetches();
		});

		it('renders their discrepancies once the client-side check resolves, with no trigger button', async () => {
			const scope: DiscrepancyScope = {
				temporalUnit: 'year',
				bySpecies: false
			};
			mockScopedResults(
				withResult(scope, {
					success: true,
					discrepancies: [buildDiscrepancy({ time_period: '2026-01-01' })]
				})
			);
			renderReport();

			const section = getScopeSection(scope);
			await waitFor(() => {
				expect(
					within(section).getByText('discrepancies found for year stats 2026')
				).toBeTruthy();
			});
			expect(
				within(section).queryByRole('button', { name: 'Run check' })
			).toBeNull();
		});

		it('renders "no discrepancies found" for a scope with none', async () => {
			const scope: DiscrepancyScope = {
				temporalUnit: 'all-time',
				bySpecies: false
			};
			renderReport();

			await waitFor(() => {
				expect(
					within(getScopeSection(scope)).getByText('No discrepancies found')
				).toBeTruthy();
			});
		});

		it('runs the 6 eager scopes one at a time, never firing the next before the previous resolves', async () => {
			const resolvers: Array<
				(result: FetchStatsCacheDiscrepanciesResult) => void
			> = [];
			vi.mocked(fetchStatsCacheDiscrepancies).mockImplementation(
				() =>
					new Promise((resolve) => {
						resolvers.push(resolve);
					})
			);

			renderReport();

			for (
				let expectedCalls = 1;
				expectedCalls <= EAGER_DISCREPANCY_SCOPES.length;
				expectedCalls++
			) {
				await waitFor(() => {
					expect(fetchStatsCacheDiscrepancies).toHaveBeenCalledTimes(
						expectedCalls
					);
				});
				// No call beyond this one has fired yet — proves series, not parallel.
				expect(resolvers).toHaveLength(expectedCalls);
				await act(async () => {
					resolvers[expectedCalls - 1]({ success: true, discrepancies: [] });
				});
			}
		});

		it('calls each eager scope with only its temporalUnit/bySpecies, no periods/speciesIds', async () => {
			renderReport();

			await waitFor(() => {
				expect(fetchStatsCacheDiscrepancies).toHaveBeenCalledTimes(
					EAGER_DISCREPANCY_SCOPES.length
				);
			});
			EAGER_DISCREPANCY_SCOPES.forEach((scope) => {
				expect(fetchStatsCacheDiscrepancies).toHaveBeenCalledWith({
					temporalUnit: scope.temporalUnit,
					bySpecies: scope.bySpecies
				});
			});
		});
	});

	describe('lazy scopes (month, day)', () => {
		it('renders a "Run check" trigger instead of discrepancies on first render', async () => {
			const scope: DiscrepancyScope = {
				temporalUnit: 'month',
				bySpecies: false
			};
			renderReport();

			const section = getScopeSection(scope);
			expect(
				within(section).getByRole('button', { name: 'Run check' })
			).toBeTruthy();
			expect(within(section).queryByText('No discrepancies found')).toBeNull();

			await flushEagerFetches();
		});

		it('calls the discrepancy-check action when the trigger is clicked', async () => {
			const scope: DiscrepancyScope = { temporalUnit: 'day', bySpecies: false };
			renderReport();

			fireEvent.click(
				within(getScopeSection(scope)).getByRole('button', {
					name: 'Run check'
				})
			);

			await waitFor(() => {
				expect(fetchStatsCacheDiscrepancies).toHaveBeenCalledWith({
					temporalUnit: 'day',
					bySpecies: false
				});
			});
		});

		it('shows a loading state while the action is in flight, then renders its result', async () => {
			let resolveFetch!: (result: FetchStatsCacheDiscrepanciesResult) => void;
			vi.mocked(fetchStatsCacheDiscrepancies).mockImplementation(
				(params: FetchStatsCacheDiscrepanciesParams) => {
					if (params.temporalUnit === 'month' && params.bySpecies) {
						return new Promise((resolve) => {
							resolveFetch = resolve;
						});
					}
					return Promise.resolve({ success: true, discrepancies: [] });
				}
			);
			const scope: DiscrepancyScope = {
				temporalUnit: 'month',
				bySpecies: true
			};
			renderReport();
			const section = getScopeSection(scope);

			fireEvent.click(
				within(section).getByRole('button', { name: 'Run check' })
			);

			await waitFor(() => {
				expect(within(section).getByText('Checking…')).toBeTruthy();
			});

			await act(async () => {
				resolveFetch({ success: true, discrepancies: [] });
			});

			await waitFor(() => {
				expect(
					within(section).getByText('No discrepancies found')
				).toBeTruthy();
			});
		});
	});

	describe('discrepancy list item labelling', () => {
		it('labels a combined-scope item with its temporal unit and period, no species suffix', async () => {
			const scope: DiscrepancyScope = {
				temporalUnit: 'month',
				bySpecies: false
			};
			vi.mocked(fetchStatsCacheDiscrepancies).mockImplementation(
				(params: FetchStatsCacheDiscrepanciesParams) => {
					if (params.temporalUnit === 'month' && !params.bySpecies) {
						return Promise.resolve({
							success: true,
							discrepancies: [
								buildDiscrepancy({
									time_period: '2026-01-01',
									species_id: null
								})
							]
						});
					}
					return Promise.resolve({ success: true, discrepancies: [] });
				}
			);
			renderReport();
			const section = getScopeSection(scope);

			fireEvent.click(
				within(section).getByRole('button', { name: 'Run check' })
			);

			await waitFor(() => {
				expect(
					within(section).getByText(
						'discrepancies found for month stats January 2026'
					)
				).toBeTruthy();
			});
		});

		// A by-species scope's own item labelling (species heading, suffix-free
		// nested label) is covered by the 'hierarchical by-species grouping'
		// describe block below, now that those items render nested under a
		// species group rather than flat in this section.
	});

	describe('expanded discrepancy detail', () => {
		const scope: DiscrepancyScope = {
			temporalUnit: 'all-time',
			bySpecies: false
		};
		const discrepancy = buildDiscrepancy({
			time_period: null,
			cachedRow: { session_count: 5, bird_count: 10 },
			liveRow: { session_count: 7, bird_count: 10 },
			mismatchedFields: ['session_count']
		});

		async function renderExpanded() {
			mockScopedResults(
				withResult(scope, { success: true, discrepancies: [discrepancy] })
			);
			renderReport();
			const section = getScopeSection(scope);
			// The row's own expand/collapse button, addressed by its label rather
			// than as "the only button in the section" — since #1390 every row
			// also carries its sibling "fix" buttons.
			await waitFor(() => {
				expect(
					within(section).getByRole('button', { name: /^discrepancies found/ })
				).toBeTruthy();
			});
			fireEvent.click(
				within(section).getByRole('button', { name: /^discrepancies found/ })
			);
			return section;
		}

		it('renders one row for the cached value and one row for the live-computed value', async () => {
			const section = await renderExpanded();

			expect(within(section).getByRole('row', { name: /Cached/ })).toBeTruthy();
			expect(within(section).getByRole('row', { name: /Live/ })).toBeTruthy();
		});

		it('applies the mismatch style to the one mismatched column it renders', async () => {
			const section = await renderExpanded();

			const cachedCells = within(
				within(section).getByRole('row', { name: /Cached/ })
			).getAllByRole('cell');
			const liveCells = within(
				within(section).getByRole('row', { name: /Live/ })
			).getAllByRole('cell');

			// bird_count tallies (10 on both sides) and is dropped entirely, so
			// session_count is the only rendered column.
			expect(cachedCells).toHaveLength(1);
			expect(liveCells).toHaveLength(1);
			expect(cachedCells[0].className).toContain('text-error');
			expect(liveCells[0].className).toContain('text-error');
		});

		it('omits a column from the table entirely when its cached and live values tally', async () => {
			const section = await renderExpanded();

			expect(
				within(section).queryByRole('columnheader', { name: 'bird_count' })
			).toBeNull();
			expect(
				within(section).getByRole('columnheader', { name: 'session_count' })
			).toBeTruthy();
		});

		it('wraps the comparison table in a horizontally-scrollable container', async () => {
			const section = await renderExpanded();

			const table = within(section).getByRole('table');
			expect(table.parentElement?.className).toContain('overflow-x-auto');
		});
	});

	describe('hierarchical by-species grouping', () => {
		const scope: DiscrepancyScope = { temporalUnit: 'month', bySpecies: true };
		const speciesNamesById: Record<number, string> = {
			42: 'Blackcap',
			43: 'Chiffchaff'
		};

		/** A species-group heading button's accessible name starts with its species label, followed by a "(<count>)" suffix — distinct from any nested period row's label, which never ends that way. */
		const SPECIES_GROUP_HEADING_PATTERN = /\(\d+\)$/;

		async function renderWithDiscrepancies(
			discrepancies: StatsCacheDiscrepancy[]
		) {
			vi.mocked(fetchStatsCacheDiscrepancies).mockImplementation(
				(params: FetchStatsCacheDiscrepanciesParams) =>
					Promise.resolve(
						params.temporalUnit === scope.temporalUnit &&
							params.bySpecies === scope.bySpecies
							? { success: true, discrepancies }
							: { success: true, discrepancies: [] }
					)
			);
			renderReport({ speciesNamesById });
			const section = getScopeSection(scope);
			fireEvent.click(
				within(section).getByRole('button', { name: 'Run check' })
			);
			await waitFor(() => {
				expect(
					within(section).getAllByRole('button', {
						name: SPECIES_GROUP_HEADING_PATTERN
					}).length
				).toBeGreaterThan(0);
			});
			return section;
		}

		function speciesGroupButton(
			section: HTMLElement,
			speciesLabelPrefix: string
		) {
			return within(section).getByRole('button', {
				name: (accessibleName) => accessibleName.startsWith(speciesLabelPrefix)
			});
		}

		it('renders one top-level item per distinct species, not one per discrepant cell', async () => {
			const section = await renderWithDiscrepancies([
				buildDiscrepancy({ time_period: '2026-01-01', species_id: 42 }),
				buildDiscrepancy({ time_period: '2026-02-01', species_id: 42 }),
				buildDiscrepancy({ time_period: '2026-01-01', species_id: 43 })
			]);

			expect(
				within(section).getAllByRole('button', {
					name: SPECIES_GROUP_HEADING_PATTERN
				})
			).toHaveLength(2);
		});

		it('labels each species group with its name and discrepancy count', async () => {
			const section = await renderWithDiscrepancies([
				buildDiscrepancy({ time_period: '2026-01-01', species_id: 42 }),
				buildDiscrepancy({ time_period: '2026-02-01', species_id: 42 })
			]);

			expect(within(section).getByText('Blackcap (2)')).toBeTruthy();
		});

		it("falls back to 'species #<id>' when the id isn't in speciesNamesById", async () => {
			const section = await renderWithDiscrepancies([
				buildDiscrepancy({ time_period: '2026-01-01', species_id: 99 })
			]);

			expect(within(section).getByText('species #99 (1)')).toBeTruthy();
		});

		it('is collapsed by default, and its nested period rows start collapsed too once expanded', async () => {
			const section = await renderWithDiscrepancies([
				buildDiscrepancy({ time_period: '2026-01-01', species_id: 42 })
			]);
			const groupButton = speciesGroupButton(section, 'Blackcap');
			const periodLabel = discrepancyItemLabel(
				{ ...scope, bySpecies: false },
				'2026-01-01',
				null,
				speciesNamesById
			);

			expect(groupButton.getAttribute('aria-expanded')).toBe('false');

			fireEvent.click(groupButton);

			// The nested level starts collapsed too — expanding the species group
			// only reveals the period list, not that row's own detail.
			expect(groupButton.getAttribute('aria-expanded')).toBe('true');
			expect(
				within(section)
					.getByRole('button', { name: periodLabel })
					.getAttribute('aria-expanded')
			).toBe('false');
		});

		it('resets a species group’s nested expansion when a sibling species group is expanded instead', async () => {
			const section = await renderWithDiscrepancies([
				buildDiscrepancy({ time_period: '2026-01-01', species_id: 42 }),
				buildDiscrepancy({ time_period: '2026-01-01', species_id: 43 })
			]);
			// Both species share the same period, so the nested row's own label
			// is identical in each group — every lookup below is scoped to the
			// owning species group's own `<li>`, not the whole section, to tell
			// the two apart.
			const periodLabel = discrepancyItemLabel(
				{ ...scope, bySpecies: false },
				'2026-01-01',
				null,
				speciesNamesById
			);
			function blackcapGroupItem() {
				const item = speciesGroupButton(section, 'Blackcap').closest('li');
				if (!item) {
					throw new Error('No Blackcap group item rendered');
				}
				return item;
			}

			fireEvent.click(speciesGroupButton(section, 'Blackcap'));
			fireEvent.click(
				within(blackcapGroupItem()).getByRole('button', { name: periodLabel })
			);
			expect(
				within(blackcapGroupItem())
					.getByRole('button', { name: periodLabel })
					.getAttribute('aria-expanded')
			).toBe('true');

			// Expanding Chiffchaff's group collapses Blackcap's (single-expand
			// across species).
			fireEvent.click(speciesGroupButton(section, 'Chiffchaff'));
			expect(
				speciesGroupButton(section, 'Blackcap').getAttribute('aria-expanded')
			).toBe('false');

			// Re-expanding Blackcap shows its nested row collapsed again, not
			// still expanded from before.
			fireEvent.click(speciesGroupButton(section, 'Blackcap'));
			expect(
				within(blackcapGroupItem())
					.getByRole('button', { name: periodLabel })
					.getAttribute('aria-expanded')
			).toBe('false');
		});

		it('leaves a combined-scope (non-by-species) section rendering its flat per-cell list unchanged', async () => {
			const combinedScope: DiscrepancyScope = {
				temporalUnit: 'month',
				bySpecies: false
			};
			vi.mocked(fetchStatsCacheDiscrepancies).mockImplementation(
				(params: FetchStatsCacheDiscrepanciesParams) =>
					Promise.resolve(
						params.temporalUnit === 'month' && !params.bySpecies
							? {
									success: true,
									discrepancies: [
										buildDiscrepancy({
											time_period: '2026-01-01',
											species_id: null
										})
									]
								}
							: { success: true, discrepancies: [] }
					)
			);
			renderReport({ speciesNamesById });
			const section = getScopeSection(combinedScope);
			fireEvent.click(
				within(section).getByRole('button', { name: 'Run check' })
			);

			const label = discrepancyItemLabel(
				combinedScope,
				'2026-01-01',
				null,
				speciesNamesById
			);
			await waitFor(() => {
				expect(within(section).getByText(label)).toBeTruthy();
			});
			// No species-group heading of any kind — the row is a direct child
			// of the flat list, exactly as before this scope type ever existed.
			expect(
				within(section).queryAllByRole('button', {
					name: SPECIES_GROUP_HEADING_PATTERN
				})
			).toHaveLength(0);
		});
	});

	describe('fix-request state propagation across rows', () => {
		const speciesNamesById: Record<number, string> = {
			42: 'Blackcap',
			43: 'Chiffchaff'
		};
		const yearCombinedScope: DiscrepancyScope = {
			temporalUnit: 'year',
			bySpecies: false
		};
		const yearBySpeciesScope: DiscrepancyScope = {
			temporalUnit: 'year',
			bySpecies: true
		};
		// A different temporal unit entirely, so no dispatch from a `year` row
		// can ever cover it.
		const squashedMonthBySpeciesScope: DiscrepancyScope = {
			temporalUnit: 'month-squashed',
			bySpecies: true
		};

		/**
		 * One rendered row's `<li>`, located via its expand/collapse button's
		 * label. A by-species scope's rows render nested under a collapsed
		 * species group (#1409's hierarchical grouping) — their content, fix
		 * buttons included, is hidden until that group is expanded — so this
		 * expands the owning species group first when `speciesId` is given,
		 * then locates the nested, suffix-free label inside it.
		 */
		function getRow(
			scope: DiscrepancyScope,
			timePeriod: string | null,
			speciesId: number | null
		) {
			const section = getScopeSection(scope);
			let searchWithin = section;
			let label = discrepancyItemLabel(
				scope,
				timePeriod,
				speciesId,
				speciesNamesById
			);

			if (scope.bySpecies && speciesId !== null) {
				const speciesLabel =
					speciesNamesById[speciesId] ?? `species #${speciesId}`;
				const groupButton = within(section).getByRole('button', {
					name: (accessibleName) => accessibleName.startsWith(speciesLabel)
				});
				if (groupButton.getAttribute('aria-expanded') !== 'true') {
					fireEvent.click(groupButton);
				}
				const groupItem = groupButton.closest('li');
				if (!groupItem) {
					throw new Error(`No species group rendered for "${speciesLabel}"`);
				}
				searchWithin = groupItem;
				label = discrepancyItemLabel(
					{ ...scope, bySpecies: false },
					timePeriod,
					null,
					speciesNamesById
				);
			}

			const row = within(searchWithin)
				.getByRole('button', { name: label })
				.closest('li');
			if (!row) {
				throw new Error(`No discrepancy row rendered for "${label}"`);
			}
			return row;
		}

		function getFixButton(row: HTMLElement | Element, name: string) {
			return within(row as HTMLElement).getByRole('button', { name });
		}

		/**
		 * Renders three `year`/`month-squashed` discrepancy rows and clicks "Fix
		 * just this issue" on the by-species one for Blackcap/2026 — dispatching
		 * `{temporalUnit: 'year', periods: ['2026-01-01'], speciesIds: [42]}`.
		 */
		async function renderAndFixBlackcap2026() {
			mockScopedResults({
				...withResult(yearCombinedScope, {
					success: true,
					discrepancies: [
						buildDiscrepancy({ time_period: '2026-01-01', species_id: null })
					]
				}),
				...withResult(yearBySpeciesScope, {
					success: true,
					discrepancies: [
						buildDiscrepancy({ time_period: '2026-01-01', species_id: 42 }),
						buildDiscrepancy({ time_period: '2027-01-01', species_id: 43 })
					]
				}),
				...withResult(squashedMonthBySpeciesScope, {
					success: true,
					discrepancies: [
						buildDiscrepancy({ time_period: '2026-01-01', species_id: 42 })
					]
				})
			});
			renderReport({ speciesNamesById });
			await flushEagerFetches();

			fireEvent.click(
				getFixButton(
					getRow(yearBySpeciesScope, '2026-01-01', 42),
					'Fix just this issue'
				)
			);

			await waitFor(() => {
				expect(regenerateStatsCache).toHaveBeenCalledWith({
					temporalUnit: 'year',
					periods: ['2026-01-01'],
					speciesIds: [42]
				});
			});
		}

		it('flips every other rendered row covered by the dispatched scope into the disabled "fix requested" state', async () => {
			await renderAndFixBlackcap2026();

			// The combined `year` 2026 row was never clicked, but the overall write
			// pass is never speciesIds-narrowed, so the Blackcap dispatch rewrites
			// it too.
			const coveredRow = getRow(yearCombinedScope, '2026-01-01', null);
			await waitFor(() => {
				expect(
					within(coveredRow as HTMLElement).getByText('Fix requested')
				).toBeTruthy();
			});
			expect(
				getFixButton(coveredRow, 'Fix for all time periods')
			).toHaveProperty('disabled', true);
		});

		it('leaves rows not covered by the dispatched scope untouched', async () => {
			await renderAndFixBlackcap2026();

			await waitFor(() => {
				expect(
					within(
						getRow(yearCombinedScope, '2026-01-01', null) as HTMLElement
					).getByText('Fix requested')
				).toBeTruthy();
			});

			// A different period of the same temporal unit, and the same species in
			// a different temporal unit — neither is covered.
			[
				getRow(yearBySpeciesScope, '2027-01-01', 43),
				getRow(squashedMonthBySpeciesScope, '2026-01-01', 42)
			].forEach((row) => {
				expect(
					within(row as HTMLElement).queryByText('Fix requested')
				).toBeNull();
				expect(getFixButton(row, 'Fix just this issue')).toHaveProperty(
					'disabled',
					false
				);
			});
		});
	});
});
