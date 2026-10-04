import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	waitFor,
	fireEvent
} from '@testing-library/react';
import { TabSet } from '../TabSet';
import type { TabConfig } from '../TabContent';
import type { ViewedGroup } from '@/app/lib/group-slug';

type Params = { speciesName: string };

const viewedGroup: ViewedGroup = { id: 1, slug: 'alpha' };
const params: Params = { speciesName: 'Blue Tit' };

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

/**
 * One tab's `TabComponent`, tagged with its own id so a test can tell which
 * tab's content it is looking at, what data that tab received, and — on a
 * `data-params` attribute, to keep it out of the panel's text content — which
 * params it was handed.
 */
function buildTabComponent(tabId: string) {
	return function RenderedTab({
		params: receivedParams,
		data
	}: {
		params: unknown;
		data: unknown;
	}) {
		return (
			<p
				data-testid={`panel-${tabId}`}
				data-params={JSON.stringify(receivedParams)}
			>
				{(data as string | null) ?? 'no data'}
			</p>
		);
	};
}

/** The params the named tab's `TabComponent` was rendered with. */
function paramsReceivedBy(tabId: string) {
	return JSON.parse(
		screen.getByTestId(`panel-${tabId}`).getAttribute('data-params') ?? 'null'
	);
}

function buildTab(
	tabId: string,
	label: string,
	dataFetcher?: TabConfig<unknown, Params>['dataFetcher']
): TabConfig<unknown, Params> {
	return {
		id: tabId,
		label,
		dataFetcher,
		TabComponent: buildTabComponent(tabId)
	};
}

// A tab that fetches lazily, a second that fetches lazily, and a third that
// renders immediately with no fetcher at all (`TabConfig.dataFetcher` is
// optional for tabs that manage their own data).
function buildTabs() {
	return [
		buildTab(
			'overview',
			'Overview',
			vi.fn().mockResolvedValue('overview data')
		),
		buildTab('trends', 'Trends', vi.fn().mockResolvedValue('trends data')),
		buildTab('notes', 'Notes')
	];
}

function renderTabSet({ initialTabId }: { initialTabId?: string } = {}) {
	return render(
		<TabSet
			tabs={buildTabs()}
			params={params}
			viewedGroup={viewedGroup}
			initialTabId={initialTabId}
		/>
	);
}

/** The id of the tab `TabNav` is currently marking as selected. */
function activeTabLabel() {
	return screen
		.getAllByRole('button')
		.find((button) => button.getAttribute('aria-current') === 'true')
		?.textContent;
}

/**
 * The ids of the tab panels that are actually on screen — a mounted but
 * inactive panel is kept in the DOM by `ConditionalTabPanel`, hidden behind an
 * `aria-hidden` wrapper, so presence alone isn't visibility.
 */
function visibleTabPanelIds() {
	return screen
		.queryAllByTestId(/^panel-/)
		.filter((panel) => !panel.closest('[aria-hidden="true"]'))
		.map((panel) => panel.getAttribute('data-testid'));
}

/** Wait for a lazily-fetched tab to finish loading and render its data. */
function waitForTabData(tabId: string, expectedText: string) {
	return waitFor(() =>
		expect(screen.getByTestId(`panel-${tabId}`).textContent).toBe(expectedText)
	);
}

describe('TabSet', () => {
	describe('tab selection', () => {
		it('renders the first tab active by default when no initialTabId is given', async () => {
			renderTabSet();
			expect(activeTabLabel()).toBe('Overview');
			await waitFor(() =>
				expect(visibleTabPanelIds()).toEqual(['panel-overview'])
			);
		});

		it('renders the tab matching initialTabId active when given and valid', async () => {
			renderTabSet({ initialTabId: 'trends' });
			expect(activeTabLabel()).toBe('Trends');
			await waitFor(() =>
				expect(visibleTabPanelIds()).toEqual(['panel-trends'])
			);
		});
	});

	describe('switching tabs', () => {
		it('updates which tab content is visible when a different tab is selected via TabNav', async () => {
			renderTabSet();
			await waitFor(() =>
				expect(visibleTabPanelIds()).toEqual(['panel-overview'])
			);

			fireEvent.click(screen.getByRole('button', { name: 'Notes' }));

			expect(activeTabLabel()).toBe('Notes');
			expect(visibleTabPanelIds()).toEqual(['panel-notes']);
			// The previously-active tab stays mounted (hidden), rather than being
			// torn down and refetched on the way back.
			expect(screen.getByTestId('panel-overview').textContent).toBe(
				'overview data'
			);
		});
	});

	describe('per-tab params', () => {
		// A set whose second tab needs a completely different params shape from
		// the page's shared one, so it carries its own.
		type MonthParams = { month: string };
		const ownParams: MonthParams = { month: '2024-05' };

		// Both fetchers are typed rather than bare `vi.fn()`s, so this fixture
		// also exercises the type-level half of the feature: each tab's
		// `ParamsType` is inferred from its own fetcher, and a tab the shared
		// params can't satisfy only compiles because it carries its own.
		function renderMixedParamsTabSet() {
			const sharedParamsFetcher = vi
				.fn<(params: Params, viewedGroup: ViewedGroup) => Promise<unknown>>()
				.mockResolvedValue('shared data');
			const ownParamsFetcher = vi
				.fn<
					(params: MonthParams, viewedGroup: ViewedGroup) => Promise<unknown>
				>()
				.mockResolvedValue('own data');
			const utils = render(
				<TabSet
					tabs={
						[
							{
								id: 'overview',
								label: 'Overview',
								dataFetcher: sharedParamsFetcher,
								TabComponent: buildTabComponent('overview')
							},
							{
								id: 'month',
								label: 'Month',
								params: ownParams,
								dataFetcher: ownParamsFetcher,
								TabComponent: buildTabComponent('month')
							}
						] as const
					}
					params={params}
					viewedGroup={viewedGroup}
				/>
			);
			return { ...utils, sharedParamsFetcher, ownParamsFetcher };
		}

		it("hands the set's shared params to a tab that declares none", async () => {
			const { sharedParamsFetcher } = renderMixedParamsTabSet();

			await waitForTabData('overview', 'shared data');

			expect(paramsReceivedBy('overview')).toEqual(params);
			expect(sharedParamsFetcher).toHaveBeenCalledExactlyOnceWith(
				params,
				viewedGroup
			);
		});

		it('hands a tab that declares its own params those instead, leaving the other tabs on the shared ones', async () => {
			const { ownParamsFetcher } = renderMixedParamsTabSet();

			fireEvent.click(screen.getByRole('button', { name: 'Month' }));
			await waitForTabData('month', 'own data');

			expect(paramsReceivedBy('month')).toEqual(ownParams);
			expect(ownParamsFetcher).toHaveBeenCalledExactlyOnceWith(
				ownParams,
				viewedGroup
			);
			expect(paramsReceivedBy('overview')).toEqual(params);
		});
	});

	describe('initialTabData', () => {
		it('passes initialData only to the tab whose id matches initialTabData.tabId', async () => {
			const tabs = buildTabs();
			render(
				<TabSet
					tabs={tabs}
					params={params}
					viewedGroup={viewedGroup}
					initialTabId="trends"
					initialTabData={{ tabId: 'trends', data: 'prefetched trends' }}
				/>
			);

			// The matching tab renders its prefetched data without fetching.
			expect(screen.getByTestId('panel-trends').textContent).toBe(
				'prefetched trends'
			);
			expect(tabs[1].dataFetcher).not.toHaveBeenCalled();

			// A different tab gets no `initialData` at all, so it still fetches.
			fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
			await waitFor(() =>
				expect(screen.getByTestId('panel-overview').textContent).toBe(
					'overview data'
				)
			);
			expect(tabs[0].dataFetcher).toHaveBeenCalledTimes(1);
		});
	});

	describe('URL write-back', () => {
		// `replaceState` is spied rather than stubbed so the URL genuinely
		// changes, letting a test assert on `window.location` as well as on how
		// the history API was called.
		function spyOnHistory() {
			return {
				replaceState: vi.spyOn(window.history, 'replaceState'),
				pushState: vi.spyOn(window.history, 'pushState')
			};
		}

		it('updates the tabId search param when a tab is selected', async () => {
			window.history.replaceState(null, '', '/species/Blue%20Tit');
			renderTabSet();
			await waitForTabData('overview', 'overview data');

			fireEvent.click(screen.getByRole('button', { name: 'Notes' }));

			expect(window.location.search).toBe('?tabId=notes');
		});

		it('does not push a new history entry', async () => {
			window.history.replaceState(null, '', '/species/Blue%20Tit');
			renderTabSet();
			await waitForTabData('overview', 'overview data');
			const history = spyOnHistory();

			fireEvent.click(screen.getByRole('button', { name: 'Notes' }));

			expect(history.replaceState).toHaveBeenCalledTimes(1);
			expect(history.pushState).not.toHaveBeenCalled();
		});

		it('leaves other search params untouched when updating tabId', async () => {
			window.history.replaceState(
				null,
				'',
				'/species/Blue%20Tit?combineYears=true&tabId=overview'
			);
			renderTabSet();
			await waitForTabData('overview', 'overview data');

			fireEvent.click(screen.getByRole('button', { name: 'Trends' }));
			await waitForTabData('trends', 'trends data');

			const searchParams = new URLSearchParams(window.location.search);
			expect(searchParams.get('combineYears')).toBe('true');
			expect(searchParams.get('tabId')).toBe('trends');
		});
	});
});
