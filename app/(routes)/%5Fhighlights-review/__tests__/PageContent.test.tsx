import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { HighlightsReviewPageContent } from '../PageContent';
import type { HighlightsReviewParams, HighlightsReviewPageData } from '../page';
import type { TemporalSelection } from '@/app/lib/temporal-filter';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
import type { CombinedHighlight } from '@/app/lib/highlights/types';
import type { ViewedGroup } from '@/app/lib/group-slug';

const { mockPush, mockGetCombinedHighlightsOfTypeAcrossScopes } = vi.hoisted(
	() => ({
		mockPush: vi.fn(),
		mockGetCombinedHighlightsOfTypeAcrossScopes: vi.fn()
	})
);

// Local override of the global next/navigation mock (vitest.setup.tsx) so the
// push calls this component makes can be asserted on directly.
vi.mock('next/navigation', () => ({
	useRouter: () => ({
		push: mockPush,
		replace: vi.fn(),
		refresh: vi.fn(),
		back: vi.fn(),
		forward: vi.fn(),
		prefetch: vi.fn()
	})
}));

// The one collaborator this component orchestrates — mock it as a black box.
vi.mock('@/app/lib/highlights/lib/hg2', () => ({
	getCombinedHighlightsOfTypeAcrossScopes:
		mockGetCombinedHighlightsOfTypeAcrossScopes
}));

// Each rendered highlight's ReportHighlightButton (#1122) renders
// ReportHighlightModal, which imports the real server action — mock it so
// importing the tree doesn't pull that in (same as SessionHighlights.test.tsx).
vi.mock('@/app/actions/highlight-reports', () => ({
	reportHighlight: vi.fn()
}));

const viewedGroup: ViewedGroup = { id: 1, slug: 'alpha' };

function makeHighlight(type: string, sentence: string): CombinedHighlight {
	return {
		formatters: { combinedHighlightPrinter: () => sentence },
		descriptor: { category: 'rarity', type, unit: 'encounter' },
		value: { timePeriod: '2025-03-15', value: 1, species: null },
		species: 'Robin',
		bestPosition: 1,
		scopes: []
	} as CombinedHighlight;
}

function queryUrlParams(url: string): URLSearchParams {
	return new URLSearchParams(url.split('?')[1] ?? '');
}

function renderPageContent({
	selection = {},
	temporalUnit = 'month',
	highlightType = 'rarities',
	years = [2024, 2025]
}: {
	selection?: TemporalSelection;
	temporalUnit?: TemporalUnit;
	highlightType?: string;
	years?: number[];
} = {}) {
	const params: HighlightsReviewParams = {
		selection,
		temporalUnit,
		highlightType
	};
	const data: HighlightsReviewPageData = { years };
	return render(
		<HighlightsReviewPageContent
			params={params}
			data={data}
			viewedGroup={viewedGroup}
		/>
	);
}

describe('HighlightsReviewPageContent', () => {
	afterEach(() => {
		cleanup();
		mockPush.mockClear();
		mockGetCombinedHighlightsOfTypeAcrossScopes.mockReset();
	});

	describe('when nothing is selected', () => {
		it('defaults to one year-granularity period per year the group has data for, ignoring the temporal-unit dropdown', async () => {
			mockGetCombinedHighlightsOfTypeAcrossScopes.mockResolvedValue([]);
			renderPageContent({
				selection: {},
				temporalUnit: 'day',
				years: [2024, 2025]
			});

			await screen.findByTestId('highlights-review-years-default');

			const calledTimePeriods =
				mockGetCombinedHighlightsOfTypeAcrossScopes.mock.calls.map(
					([options]) => options.timePeriod
				);
			expect(new Set(calledTimePeriods)).toEqual(
				new Set(['2024-01-01', '2025-01-01'])
			);
			for (const [options] of mockGetCombinedHighlightsOfTypeAcrossScopes.mock
				.calls) {
				expect(options.temporalUnit).toBe('year');
			}
		});

		it('shows a no-data message and fetches nothing when the group has no years of data at all', async () => {
			renderPageContent({ selection: {}, years: [] });

			await screen.findByTestId('highlights-review-no-data');
			expect(
				mockGetCombinedHighlightsOfTypeAcrossScopes
			).not.toHaveBeenCalled();
		});
	});

	describe('when a selection is made but does not resolve to a usable window', () => {
		it('shows a message asking the user to fix the selection, and fetches nothing', async () => {
			renderPageContent({ selection: { fromDate: '2025-02-01' } });

			await screen.findByTestId('highlights-review-invalid');
			expect(
				mockGetCombinedHighlightsOfTypeAcrossScopes
			).not.toHaveBeenCalled();
		});
	});

	describe('once a usable window is selected', () => {
		function selectJanToFeb2025(): TemporalSelection {
			return { fromDate: '2025-01-01', toDate: '2025-02-28' };
		}

		it("shows a loading state while every period's highlights are being fetched", async () => {
			let resolveFirstCall: (value: CombinedHighlight[]) => void = () => {};
			mockGetCombinedHighlightsOfTypeAcrossScopes.mockImplementation(
				() =>
					new Promise<CombinedHighlight[]>((resolve) => {
						resolveFirstCall = resolve;
					})
			);

			renderPageContent({
				selection: selectJanToFeb2025(),
				temporalUnit: 'month'
			});

			expect(screen.getByTestId('highlights-review-loading')).toBeDefined();

			resolveFirstCall([]);
		});

		it('calls getCombinedHighlightsOfTypeAcrossScopes once per period per outlook, for the selected highlight type', async () => {
			mockGetCombinedHighlightsOfTypeAcrossScopes.mockResolvedValue([]);
			renderPageContent({
				selection: selectJanToFeb2025(),
				temporalUnit: 'month',
				highlightType: 'rarities'
			});

			await screen.findByTestId('highlights-review-empty');

			expect(mockGetCombinedHighlightsOfTypeAcrossScopes).toHaveBeenCalledTimes(
				4
			);
			const outlooksByPeriod: Record<string, string[]> = {};
			for (const [options] of mockGetCombinedHighlightsOfTypeAcrossScopes.mock
				.calls) {
				expect(options.highlightType).toBe('rarities');
				outlooksByPeriod[options.timePeriod] ??= [];
				outlooksByPeriod[options.timePeriod].push(options.outlook);
			}
			expect(new Set(Object.keys(outlooksByPeriod))).toEqual(
				new Set(['2025-01-01', '2025-02-01'])
			);
			expect(new Set(outlooksByPeriod['2025-01-01'])).toEqual(
				new Set(['intra', 'inter'])
			);
		});

		it("renders one PrimaryHeading per period with any highlights, labelled with that period's label", async () => {
			mockGetCombinedHighlightsOfTypeAcrossScopes.mockImplementation(
				async ({ timePeriod, outlook }) => {
					if (timePeriod === '2025-01-01' && outlook === 'intra') {
						return [makeHighlight('rarities', 'January highlight')];
					}
					return [];
				}
			);
			renderPageContent({
				selection: selectJanToFeb2025(),
				temporalUnit: 'month'
			});

			const heading = await screen.findByRole('heading', {
				level: 1,
				name: 'January 2025'
			});
			expect(heading).toBeDefined();
			expect(
				screen.queryByRole('heading', { level: 1, name: 'February 2025' })
			).toBeNull();
		});

		it('renders a Within subsection under a period that has intra highlights', async () => {
			mockGetCombinedHighlightsOfTypeAcrossScopes.mockImplementation(
				async ({ outlook }) =>
					outlook === 'intra'
						? [makeHighlight('rarities', 'Intra highlight sentence')]
						: []
			);
			renderPageContent({
				selection: { fromDate: '2025-01-01', toDate: '2025-01-31' },
				temporalUnit: 'month'
			});

			await screen.findByText('Intra highlight sentence');
			expect(
				screen.getByRole('heading', { level: 2, name: 'Within' })
			).toBeDefined();
		});

		it('renders a Relative subsection under a period that has inter highlights', async () => {
			mockGetCombinedHighlightsOfTypeAcrossScopes.mockImplementation(
				async ({ outlook }) =>
					outlook === 'inter'
						? [makeHighlight('rarities', 'Inter highlight sentence')]
						: []
			);
			renderPageContent({
				selection: { fromDate: '2025-01-01', toDate: '2025-01-31' },
				temporalUnit: 'month'
			});

			await screen.findByText('Inter highlight sentence');
			expect(
				screen.getByRole('heading', { level: 2, name: 'Relative' })
			).toBeDefined();
		});

		it('omits the Within subsection for a period with no intra highlights', async () => {
			mockGetCombinedHighlightsOfTypeAcrossScopes.mockImplementation(
				async ({ outlook }) =>
					outlook === 'inter'
						? [makeHighlight('rarities', 'Only an inter highlight')]
						: []
			);
			renderPageContent({
				selection: { fromDate: '2025-01-01', toDate: '2025-01-31' },
				temporalUnit: 'month'
			});

			await screen.findByText('Only an inter highlight');
			expect(
				screen.queryByRole('heading', { level: 2, name: 'Within' })
			).toBeNull();
		});

		it('omits the Relative subsection for a period with no inter highlights', async () => {
			mockGetCombinedHighlightsOfTypeAcrossScopes.mockImplementation(
				async ({ outlook }) =>
					outlook === 'intra'
						? [makeHighlight('rarities', 'Only an intra highlight')]
						: []
			);
			renderPageContent({
				selection: { fromDate: '2025-01-01', toDate: '2025-01-31' },
				temporalUnit: 'month'
			});

			await screen.findByText('Only an intra highlight');
			expect(
				screen.queryByRole('heading', { level: 2, name: 'Relative' })
			).toBeNull();
		});

		it('omits a period entirely when it has neither intra nor inter highlights', async () => {
			mockGetCombinedHighlightsOfTypeAcrossScopes.mockImplementation(
				async ({ timePeriod, outlook }) => {
					if (timePeriod === '2025-01-01' && outlook === 'intra') {
						return [makeHighlight('rarities', 'January highlight')];
					}
					return [];
				}
			);
			renderPageContent({
				selection: selectJanToFeb2025(),
				temporalUnit: 'month'
			});

			await screen.findByText('January highlight');
			expect(
				screen.queryByRole('heading', { level: 1, name: 'February 2025' })
			).toBeNull();
		});

		it('shows a no-highlights message when every period in the window is empty', async () => {
			mockGetCombinedHighlightsOfTypeAcrossScopes.mockResolvedValue([]);
			renderPageContent({
				selection: selectJanToFeb2025(),
				temporalUnit: 'month',
				highlightType: 'rarities'
			});

			const message = await screen.findByTestId('highlights-review-empty');
			expect(message.textContent).toContain('rarities');
		});
	});

	describe('changing a control', () => {
		it('re-navigates preserving the other two inputs when the temporal-unit dropdown changes', async () => {
			mockGetCombinedHighlightsOfTypeAcrossScopes.mockResolvedValue([]);
			renderPageContent({
				selection: { year: 2025 },
				temporalUnit: 'month',
				highlightType: 'rarities'
			});
			await screen.findByTestId('highlights-review-empty');

			fireEvent.change(screen.getByLabelText('Temporal unit'), {
				target: { value: 'day' }
			});

			expect(mockPush).toHaveBeenCalledTimes(1);
			const params = queryUrlParams(mockPush.mock.calls[0][0]);
			expect(params.get('year')).toBe('2025');
			expect(params.get('temporalUnit')).toBe('day');
			expect(params.get('highlightType')).toBe('rarities');
		});

		it('re-navigates preserving the other two inputs when the highlight-type dropdown changes', async () => {
			mockGetCombinedHighlightsOfTypeAcrossScopes.mockResolvedValue([]);
			renderPageContent({
				selection: { year: 2025 },
				temporalUnit: 'month',
				highlightType: 'rarities'
			});
			await screen.findByTestId('highlights-review-empty');

			fireEvent.change(screen.getByLabelText('Highlight type'), {
				target: { value: 'newBirds' }
			});

			expect(mockPush).toHaveBeenCalledTimes(1);
			const params = queryUrlParams(mockPush.mock.calls[0][0]);
			expect(params.get('year')).toBe('2025');
			expect(params.get('temporalUnit')).toBe('month');
			expect(params.get('highlightType')).toBe('newBirds');
		});

		it('re-navigates preserving temporal unit and highlight type when the window changes via TemporalFilterControls', async () => {
			mockGetCombinedHighlightsOfTypeAcrossScopes.mockResolvedValue([]);
			renderPageContent({
				selection: { year: 2024 },
				temporalUnit: 'month',
				highlightType: 'rarities',
				years: [2024, 2025]
			});
			await screen.findByTestId('highlights-review-empty');

			fireEvent.change(screen.getByLabelText('Year'), {
				target: { value: '2025' }
			});

			expect(mockPush).toHaveBeenCalledTimes(1);
			const params = queryUrlParams(mockPush.mock.calls[0][0]);
			expect(params.get('year')).toBe('2025');
			expect(params.get('temporalUnit')).toBe('month');
			expect(params.get('highlightType')).toBe('rarities');
		});
	});
});
