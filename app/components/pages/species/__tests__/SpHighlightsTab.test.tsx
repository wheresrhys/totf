import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { TabContent } from '@/app/components/shared/TabContent';
import { SpHighlightsTab, type SpHighlightsTabData } from '../SpHighlightsTab';
import notableRetrapsSnapshot from '@/test-fixtures/snapshots/notable_retraps/robin-alpha.retraps.json';
import type { NotableRetrapsResult } from '@/app/models/db';
import type { SpeciesTotalsTabParams } from '@/app/actions/sp-data';
import type { HighlightsOfType } from '@/app/lib/highlights/types';

// `SpHighlightsTab.tsx` statically imports `fetchNotableRetraps` (a real
// server action whose module eagerly constructs a Supabase client at import
// time) and `getHighlightsWithinTimeWindow` purely to build its
// `fetchHighlightsTabData`/`spHighlightsTab` exports — neither is actually
// called by these tests (they drive `TabContent` with their own stub
// `dataFetcher` instead), but the module still needs mocking out so merely
// importing the component doesn't throw on a missing Supabase URL.
vi.mock('@/app/actions/sp-data', () => ({
	fetchNotableRetraps: vi.fn()
}));
vi.mock('@/app/lib/highlights', () => ({
	getHighlightsWithinTimeWindow: vi.fn()
}));

// `SpHighlightsTab` is a pure presentational `TabConfig.TabComponent`
// (#1066) — fetching/loading/error state lives in `TabContent` (#1057), so
// these tests mount it through a real `TabContent`, exactly as `TabSet`
// does. Previously this component handrolled its own fetch with no `.catch`
// at all, so a rejected fetch left it spinning forever — the error-state
// test below exercises the fix.
const params: SpeciesTotalsTabParams = { speciesName: 'Robin' };
const viewedGroup = { id: 1, slug: 'alpha' };

/**
 * One renderable highlight. `highlightListPrefixPrinter` is the only
 * formatter `HighlightsByTimePeriod` reaches, so it carries the identifying
 * text a test asserts on.
 */
function buildHighlight(prefix: string): HighlightsOfType {
	return {
		descriptor: { category: 'count', type: 'most-birds', unit: 'bird' },
		scope: { temporalUnit: 'day' },
		values: [{ timePeriod: '2025-01-16', value: 42, species: null }],
		formatters: {
			highlightListPrefixPrinter: () => prefix,
			combinedHighlightPrinter: () => prefix
		}
	};
}

function buildData(
	overrides: Partial<SpHighlightsTabData> = {}
): SpHighlightsTabData {
	return {
		sessionHighlights: [],
		monthHighlights: [],
		notableRetraps: notableRetrapsSnapshot as NotableRetrapsResult[],
		...overrides
	};
}

function renderTab({
	initialData,
	dataFetcher = vi.fn()
}: {
	initialData?: SpHighlightsTabData | null;
	dataFetcher?: () => Promise<SpHighlightsTabData>;
} = {}) {
	return render(
		<TabContent
			dataFetcher={dataFetcher}
			TabComponent={SpHighlightsTab}
			params={params}
			viewedGroup={viewedGroup}
			{...(initialData === undefined ? {} : { initialData })}
		/>
	);
}

describe('SpHighlightsTab', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	describe('rendering with server-prefetched data', () => {
		it('renders session and month highlights sections once data loads', () => {
			renderTab({
				initialData: buildData({
					sessionHighlights: [buildHighlight('Busiest session')],
					monthHighlights: [buildHighlight('Busiest month')]
				})
			});
			expect(screen.getByText('Session highlights')).toBeTruthy();
			expect(screen.getByText(/Busiest session/)).toBeTruthy();
			expect(screen.getByText('Month highlights')).toBeTruthy();
			expect(screen.getByText(/Busiest month/)).toBeTruthy();
		});

		it('renders the notable retraps table when notableRetraps is non-empty', () => {
			renderTab({ initialData: buildData() });
			expect(screen.getByRole('table')).toBeTruthy();
			const rows = document.querySelectorAll('tbody tr');
			expect(rows.length).toBe(notableRetrapsSnapshot.length);
		});

		it('renders a "no notable retraps found" message when notableRetraps is empty', () => {
			renderTab({ initialData: buildData({ notableRetraps: [] }) });
			expect(screen.getByText('No notable retraps found')).toBeTruthy();
			expect(screen.queryByRole('table')).toBeNull();
		});
	});

	describe('rendering without prefetched data', () => {
		it('shows a loading state before the dataFetcher resolves', () => {
			let resolveData!: (v: SpHighlightsTabData) => void;
			const dataFetcher = vi.fn(
				() =>
					new Promise<SpHighlightsTabData>((resolve) => {
						resolveData = resolve;
					})
			);
			renderTab({ dataFetcher });
			expect(document.querySelector('.loading')).toBeTruthy();
			resolveData(buildData());
		});

		it('renders the notable retraps table once the dataFetcher resolves', async () => {
			const dataFetcher = vi.fn().mockResolvedValue(buildData());
			renderTab({ dataFetcher });
			await waitFor(() => {
				expect(screen.getByRole('table')).toBeTruthy();
			});
			expect(dataFetcher).toHaveBeenCalledWith(params, viewedGroup);
		});

		it('shows a visible error state on a rejected fetch instead of hanging in an indefinite spinner', async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			const dataFetcher = vi.fn().mockRejectedValue(new Error('boom'));
			renderTab({ dataFetcher });
			await waitFor(() => {
				expect(screen.getByRole('alert')).toBeTruthy();
			});
			expect(document.querySelector('.loading')).toBeNull();
		});
	});
});
