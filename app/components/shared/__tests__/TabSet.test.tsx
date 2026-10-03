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
 * tab's content it is looking at and what data that tab received.
 */
function buildTabComponent(tabId: string) {
	return function RenderedTab({ data }: { data: unknown }) {
		return (
			<p data-testid={`panel-${tabId}`}>
				{(data as string | null) ?? 'no data'}
			</p>
		);
	};
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
		<TabSet<Params>
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

	describe('initialTabData', () => {
		it('passes initialData only to the tab whose id matches initialTabData.tabId', async () => {
			const tabs = buildTabs();
			render(
				<TabSet<Params>
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
});
