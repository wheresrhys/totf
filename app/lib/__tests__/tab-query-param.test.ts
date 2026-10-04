import { describe, it, expect, vi } from 'vitest';
import type { ViewedGroup } from '../group-slug';
import {
	resolveInitialTabId,
	readTabIdSearchParam,
	prefetchActiveTabData
} from '../tab-query-param';

describe('resolveInitialTabId', () => {
	const knownTabIds = ['year-totals', 'session-totals', 'bird-list'];

	describe('Usual', () => {
		it('returns defaultTabId when requestedTabId is undefined', () => {
			expect(resolveInitialTabId(undefined, knownTabIds, 'year-totals')).toBe(
				'year-totals'
			);
		});

		it('returns requestedTabId when it is a member of knownTabIds', () => {
			expect(resolveInitialTabId('bird-list', knownTabIds, 'year-totals')).toBe(
				'bird-list'
			);
		});
	});

	describe('Structure', () => {
		it('returns requestedTabId when it already equals defaultTabId (no-op case)', () => {
			expect(
				resolveInitialTabId('year-totals', knownTabIds, 'year-totals')
			).toBe('year-totals');
		});

		it('returns a different-but-valid member of knownTabIds over the default (param wins)', () => {
			expect(
				resolveInitialTabId('session-totals', knownTabIds, 'year-totals')
			).toBe('session-totals');
		});
	});

	describe('Edge', () => {
		it('falls back to defaultTabId when requestedTabId is an empty string', () => {
			expect(resolveInitialTabId('', knownTabIds, 'year-totals')).toBe(
				'year-totals'
			);
		});

		it('falls back to defaultTabId when requestedTabId is a non-empty string not present in knownTabIds', () => {
			expect(
				resolveInitialTabId('not-a-real-tab', knownTabIds, 'year-totals')
			).toBe('year-totals');
		});

		it('always returns defaultTabId when knownTabIds is empty', () => {
			expect(resolveInitialTabId('bird-list', [], 'year-totals')).toBe(
				'year-totals'
			);
		});
	});
});

describe('readTabIdSearchParam', () => {
	describe('Usual', () => {
		it('returns the resolved tabId when searchParams resolves with one', async () => {
			await expect(
				readTabIdSearchParam(Promise.resolve({ tabId: 'bird-list' }))
			).resolves.toBe('bird-list');
		});
	});

	describe('Edge', () => {
		it('returns undefined when searchParams is not provided at all', async () => {
			await expect(readTabIdSearchParam(undefined)).resolves.toBeUndefined();
		});

		it('returns undefined when searchParams resolves with no tabId key', async () => {
			await expect(
				readTabIdSearchParam(Promise.resolve({}))
			).resolves.toBeUndefined();
		});
	});
});

describe('prefetchActiveTabData', () => {
	type SpeciesPageParams = { speciesName: string };
	const params: SpeciesPageParams = { speciesName: 'Blue Tit' };
	const viewedGroup: ViewedGroup = { id: 7, slug: 'alpha' };

	// One tab that prefetches and one that fetches for itself, so every test
	// can assert both that the right fetcher ran and that the other didn't.
	const buildTabs = (fetchingTabResult: unknown = { totals: 42 }) => {
		const fetchingTabFetcher = vi.fn<
			(params: SpeciesPageParams, viewedGroup: ViewedGroup) => Promise<unknown>
		>(async () => fetchingTabResult);
		return {
			fetchingTabFetcher,
			tabs: [
				{ id: 'self-fetching-tab' },
				{ id: 'fetching-tab', dataFetcher: fetchingTabFetcher }
			]
		};
	};

	describe('tab has a dataFetcher', () => {
		it("awaits the matching tab's dataFetcher with the given params and viewedGroup, and returns its resolved data keyed by the active tab id", async () => {
			const { tabs, fetchingTabFetcher } = buildTabs({ totals: 42 });

			const prefetched = await prefetchActiveTabData(
				tabs,
				'fetching-tab',
				params,
				viewedGroup
			);

			expect(fetchingTabFetcher).toHaveBeenCalledExactlyOnceWith(
				params,
				viewedGroup
			);
			expect(prefetched).toEqual({
				tabId: 'fetching-tab',
				data: { totals: 42 }
			});
		});
	});

	describe('tab declares its own params', () => {
		type MonthTabParams = { month: string };
		const ownParams: MonthTabParams = { month: '2024-05' };

		// A tab whose fetcher wants a params shape the page's shared one can't
		// satisfy, so it carries its own — the case `TabConfigInSet` makes the
		// compiler insist on. Both fetchers are typed rather than bare
		// `vi.fn()`s so this fixture exercises that type-level half too: each
		// tab's `ParamsType` is inferred from its own fetcher.
		const buildMixedParamsTabs = () => {
			const sharedParamsFetcher = vi.fn<
				(
					params: SpeciesPageParams,
					viewedGroup: ViewedGroup
				) => Promise<unknown>
			>(async () => 'shared data');
			const ownParamsFetcher = vi.fn<
				(params: MonthTabParams, viewedGroup: ViewedGroup) => Promise<unknown>
			>(async () => 'own data');
			return {
				sharedParamsFetcher,
				ownParamsFetcher,
				tabs: [
					{ id: 'overview', dataFetcher: sharedParamsFetcher },
					{ id: 'month', params: ownParams, dataFetcher: ownParamsFetcher }
				] as const
			};
		};

		it("prefetches it with its own params rather than the set's shared ones", async () => {
			const { tabs, ownParamsFetcher, sharedParamsFetcher } =
				buildMixedParamsTabs();

			const prefetched = await prefetchActiveTabData(
				tabs,
				'month',
				params,
				viewedGroup
			);

			expect(ownParamsFetcher).toHaveBeenCalledExactlyOnceWith(
				ownParams,
				viewedGroup
			);
			expect(sharedParamsFetcher).not.toHaveBeenCalled();
			expect(prefetched).toEqual({ tabId: 'month', data: 'own data' });
		});

		it("still prefetches a sibling tab that declares none with the set's shared params", async () => {
			const { tabs, sharedParamsFetcher } = buildMixedParamsTabs();

			const prefetched = await prefetchActiveTabData(
				tabs,
				'overview',
				params,
				viewedGroup
			);

			expect(sharedParamsFetcher).toHaveBeenCalledExactlyOnceWith(
				params,
				viewedGroup
			);
			expect(prefetched).toEqual({ tabId: 'overview', data: 'shared data' });
		});
	});

	describe('tab has no dataFetcher', () => {
		it("returns undefined without calling any other tab's dataFetcher", async () => {
			const { tabs, fetchingTabFetcher } = buildTabs();

			const prefetched = await prefetchActiveTabData(
				tabs,
				'self-fetching-tab',
				params,
				viewedGroup
			);

			expect(prefetched).toBeUndefined();
			expect(fetchingTabFetcher).not.toHaveBeenCalled();
		});
	});

	describe('tab is declared clientSideOnly', () => {
		it('returns undefined without running its dataFetcher, so the tab fetches for itself after hydration', async () => {
			const clientSideOnlyFetcher = vi.fn<
				(
					params: SpeciesPageParams,
					viewedGroup: ViewedGroup
				) => Promise<unknown>
			>(async () => 'should never be reached');

			const prefetched = await prefetchActiveTabData(
				[
					{
						id: 'highlights',
						dataFetcher: clientSideOnlyFetcher,
						clientSideOnly: true
					}
				],
				'highlights',
				params,
				viewedGroup
			);

			expect(prefetched).toBeUndefined();
			expect(clientSideOnlyFetcher).not.toHaveBeenCalled();
		});
	});

	describe('activeTabId matches no tab in the list', () => {
		it('returns undefined without throwing, given an unvalidated id', async () => {
			const { tabs, fetchingTabFetcher } = buildTabs();

			const prefetched = await prefetchActiveTabData(
				tabs,
				'not-a-real-tab',
				params,
				viewedGroup
			);

			expect(prefetched).toBeUndefined();
			expect(fetchingTabFetcher).not.toHaveBeenCalled();
		});
	});
});
