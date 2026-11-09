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
import { fetchStatsCacheDiscrepancies } from '@/app/actions/stats-cache-discrepancies';
import type { FetchStatsCacheDiscrepanciesResult } from '@/app/actions/stats-cache-discrepancies';
import {
	DISCREPANCY_SCOPES,
	discrepancyScopeKey,
	discrepancyScopeHeading,
	type DiscrepancyScope,
	type DiscrepancyScopeResults
} from '../discrepancy-scopes';
import type { StatsCacheDiscrepancy } from '@/modules/stats';

vi.mock('@/app/actions/stats-cache-discrepancies', () => ({
	fetchStatsCacheDiscrepancies: vi.fn()
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

// Every eager scope defaults to "no discrepancies" so a test only has to
// override the one scope it cares about.
function emptyEagerDiscrepancies(): DiscrepancyScopeResults {
	const results: DiscrepancyScopeResults = {};
	DISCREPANCY_SCOPES.forEach((scope) => {
		results[discrepancyScopeKey(scope)] = { success: true, discrepancies: [] };
	});
	return results;
}

function renderReport(
	overrides: {
		eagerDiscrepancies?: DiscrepancyScopeResults;
		speciesNamesById?: Record<number, string>;
	} = {}
) {
	return render(
		<StatsCacheDiscrepanciesReport
			eagerDiscrepancies={
				overrides.eagerDiscrepancies ?? emptyEagerDiscrepancies()
			}
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
): DiscrepancyScopeResults {
	const eagerDiscrepancies = emptyEagerDiscrepancies();
	eagerDiscrepancies[discrepancyScopeKey(scope)] = result;
	return eagerDiscrepancies;
}

describe('StatsCacheDiscrepanciesReport', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	describe('scope ordering', () => {
		it('renders the 10 scopes in all-time, year, month-squashed, month, day order, combined pass then by-species pass', () => {
			renderReport();

			const headings = screen
				.getAllByRole('heading', { level: 3 })
				.map((heading) => heading.textContent);

			expect(headings).toEqual(DISCREPANCY_SCOPES.map(discrepancyScopeHeading));
		});
	});

	describe('eager scopes (all-time, year, month-squashed)', () => {
		it('renders their discrepancies immediately from the page-fetched data, with no trigger button', () => {
			const scope: DiscrepancyScope = {
				temporalUnit: 'year',
				bySpecies: false
			};
			renderReport({
				eagerDiscrepancies: withResult(scope, {
					success: true,
					discrepancies: [buildDiscrepancy({ time_period: '2026-01-01' })]
				})
			});

			const section = getScopeSection(scope);
			expect(
				within(section).queryByRole('button', { name: 'Run check' })
			).toBeNull();
			expect(
				within(section).getByText('discrepancies found for year stats 2026')
			).toBeTruthy();
		});

		it('renders "no discrepancies found" for a scope with none', () => {
			const scope: DiscrepancyScope = {
				temporalUnit: 'all-time',
				bySpecies: false
			};
			renderReport();

			expect(
				within(getScopeSection(scope)).getByText('No discrepancies found')
			).toBeTruthy();
		});
	});

	describe('lazy scopes (month, day)', () => {
		it('renders a "Run check" trigger instead of discrepancies on first render', () => {
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
		});

		it('calls the discrepancy-check action when the trigger is clicked', async () => {
			vi.mocked(fetchStatsCacheDiscrepancies).mockResolvedValue({
				success: true,
				discrepancies: []
			});
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
			vi.mocked(fetchStatsCacheDiscrepancies).mockReturnValue(
				new Promise((resolve) => {
					resolveFetch = resolve;
				})
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
			vi.mocked(fetchStatsCacheDiscrepancies).mockResolvedValue({
				success: true,
				discrepancies: [
					buildDiscrepancy({ time_period: '2026-01-01', species_id: null })
				]
			});
			const scope: DiscrepancyScope = {
				temporalUnit: 'month',
				bySpecies: false
			};
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

		it('labels a by-species-scope item with a "for species <name>" suffix', async () => {
			vi.mocked(fetchStatsCacheDiscrepancies).mockResolvedValue({
				success: true,
				discrepancies: [
					buildDiscrepancy({ time_period: '2026-01-01', species_id: 42 })
				]
			});
			const scope: DiscrepancyScope = {
				temporalUnit: 'month',
				bySpecies: true
			};
			renderReport({ speciesNamesById: { 42: 'Blackcap' } });
			const section = getScopeSection(scope);

			fireEvent.click(
				within(section).getByRole('button', { name: 'Run check' })
			);

			await waitFor(() => {
				expect(
					within(section).getByText(
						'discrepancies found for month stats January 2026 for species Blackcap'
					)
				).toBeTruthy();
			});
		});
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

		function renderExpanded() {
			renderReport({
				eagerDiscrepancies: withResult(scope, {
					success: true,
					discrepancies: [discrepancy]
				})
			});
			const section = getScopeSection(scope);
			fireEvent.click(within(section).getByRole('button'));
			return section;
		}

		it('renders one row for the cached value and one row for the live-computed value', () => {
			const section = renderExpanded();

			expect(within(section).getByRole('row', { name: /Cached/ })).toBeTruthy();
			expect(within(section).getByRole('row', { name: /Live/ })).toBeTruthy();
		});

		it('applies the mismatch style only to columns where the two rows actually differ', () => {
			const section = renderExpanded();

			const cachedCells = within(
				within(section).getByRole('row', { name: /Cached/ })
			).getAllByRole('cell');
			const liveCells = within(
				within(section).getByRole('row', { name: /Live/ })
			).getAllByRole('cell');

			// session_count is the first (mismatched) column, bird_count the second (matching) one.
			expect(cachedCells[0].className).toContain('text-error');
			expect(liveCells[0].className).toContain('text-error');
			expect(cachedCells[1].className).not.toContain('text-error');
			expect(liveCells[1].className).not.toContain('text-error');
		});
	});
});
