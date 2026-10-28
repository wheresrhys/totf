import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { summaryHighlightsTab } from '../SummaryHighlightsTab';
import type { SummaryHighlightsData } from '../summary-tab-prefetchers';
import type { CombinedHighlight } from '@/modules/highlights/types';
import type { SummaryTabParams } from '../summary-tab-params';
import type { ViewedGroup } from '@/app/lib/group-slug';

// Each rendered highlight's ReportHighlightButton (#1122) renders
// ReportHighlightModal, which imports the real server action — mock it so
// importing the tree doesn't pull that in, same as PromoteControlButton.test.tsx.
vi.mock('@/app/actions/highlight-reports', () => ({
	reportHighlight: vi.fn()
}));

// `summaryHighlightsTab` imports `fetchSummaryHighlightsData` from
// `summary-tab-prefetchers.ts`, which also pulls in these three real actions —
// same mocks SummaryTotalsSection.test.tsx uses for the same reason (none of
// them are exercised here; this test renders `TabComponent` directly with its
// own `data`, never calling the real `dataFetcher`).
vi.mock('@/app/actions/spp-data', () => ({ fetchSpeciesData: vi.fn() }));
vi.mock('@/app/actions/summary-stats', () => ({
	fetchPeriodStats: vi.fn(),
	fetchCombinedMonthTotals: vi.fn()
}));
vi.mock('@/app/actions/period-totals', () => ({ fetchPeriodTotals: vi.fn() }));

const viewedGroup: ViewedGroup = { id: 1, slug: 'alpha' };

function makeHighlight(type: string, sentence: string): CombinedHighlight {
	return {
		formatters: {
			combinedHighlightPrinter: () => sentence,
			highlightListPrefixPrinter: () => ''
		},
		descriptor: { category: 'rarity', type, unit: 'encounter' },
		value: { timePeriod: '2024-09-15', value: 1, species: null },
		species: 'Robin',
		bestPosition: 1,
		scopes: []
	} as CombinedHighlight;
}

function renderHighlightsTab({
	localHighlights = [] as CombinedHighlight[],
	canReportHighlights = false
} = {}) {
	const data: SummaryHighlightsData = { inter: localHighlights, intra: [] };

	const params = { canReportHighlights } as SummaryTabParams;
	return render(
		summaryHighlightsTab.TabComponent({ data, viewedGroup, params })
	);
}

describe('summaryHighlightsTab', () => {
	afterEach(() => {
		cleanup();
	});

	it('passes params.canReportHighlights through to the Records section report buttons', () => {
		renderHighlightsTab({
			localHighlights: [
				makeHighlight('rarity-type', 'First Firecrest ever'),
				makeHighlight('count-type', 'Busiest session ever')
			],
			canReportHighlights: true
		});
		expect(screen.getAllByRole('button', { name: 'Report' })).toHaveLength(2);
	});

	it('renders no report button when canReportHighlights is false', () => {
		renderHighlightsTab({
			localHighlights: [makeHighlight('rarity-type', 'First Firecrest ever')],
			canReportHighlights: false
		});
		expect(screen.queryByRole('button', { name: 'Report' })).toBeNull();
	});
});
