import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useLinkableTabs } from '../useLinkableTabs';

afterEach(() => {
	cleanup();
});

const tabIds = ['species', 'net-rounds', 'highlights'];

describe('useLinkableTabs', () => {
	describe('Usual', () => {
		it('seeds activeTab and loadedTabs from a known requested initialTabId', () => {
			const { result } = renderHook(() =>
				useLinkableTabs({
					tabIds,
					defaultTabId: 'species',
					initialTabId: 'highlights'
				})
			);
			expect(result.current.activeTab).toBe('highlights');
			expect(result.current.loadedTabs).toEqual(new Set(['highlights']));
		});

		it('falls back to defaultTabId when no initialTabId is given', () => {
			const { result } = renderHook(() =>
				useLinkableTabs({ tabIds, defaultTabId: 'species' })
			);
			expect(result.current.activeTab).toBe('species');
			expect(result.current.loadedTabs).toEqual(new Set(['species']));
		});
	});

	describe('Structure', () => {
		it('selectTab makes the tab active and adds it to loadedTabs, preserving already-loaded tabs', () => {
			const { result } = renderHook(() =>
				useLinkableTabs({ tabIds, defaultTabId: 'species' })
			);

			act(() => result.current.selectTab('net-rounds'));
			expect(result.current.activeTab).toBe('net-rounds');
			expect(result.current.loadedTabs).toEqual(
				new Set(['species', 'net-rounds'])
			);

			act(() => result.current.selectTab('highlights'));
			expect(result.current.activeTab).toBe('highlights');
			expect(result.current.loadedTabs).toEqual(
				new Set(['species', 'net-rounds', 'highlights'])
			);
		});
	});

	describe('Edge', () => {
		it('falls back to defaultTabId when initialTabId is not a known tab', () => {
			const { result } = renderHook(() =>
				useLinkableTabs({
					tabIds,
					defaultTabId: 'species',
					initialTabId: 'not-a-real-tab'
				})
			);
			expect(result.current.activeTab).toBe('species');
			expect(result.current.loadedTabs).toEqual(new Set(['species']));
		});

		it('re-selecting the active tab leaves loadedTabs unchanged', () => {
			const { result } = renderHook(() =>
				useLinkableTabs({
					tabIds,
					defaultTabId: 'species',
					initialTabId: 'net-rounds'
				})
			);

			act(() => result.current.selectTab('net-rounds'));
			expect(result.current.activeTab).toBe('net-rounds');
			expect(result.current.loadedTabs).toEqual(new Set(['net-rounds']));
		});
	});

	// #1013's reload half: the focused tab is mirrored onto `?tabId=` so a
	// reload, a copied link or a browser-restored session reopens it. Which URL
	// string gets produced is `setTabIdSearchParam`'s own unit tests' business
	// (app/lib/__tests__/tab-query-param.test.ts) — these cover the wiring: that
	// selecting a tab replaces (rather than pushes) history state with that tab
	// named, and that a first paint doesn't touch history at all.
	describe('mirroring the focused tab onto the URL', () => {
		let replaceState: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			replaceState = vi.spyOn(window.history, 'replaceState');
			window.history.replaceState(null, '', '/group/alpha/session/2026-08-16');
			replaceState.mockClear();
		});

		afterEach(() => {
			replaceState.mockRestore();
		});

		it('replaces history state with the newly-selected tab named in ?tabId=', () => {
			const { result } = renderHook(() =>
				useLinkableTabs({ tabIds, defaultTabId: 'species' })
			);

			act(() => result.current.selectTab('highlights'));
			expect(replaceState).toHaveBeenCalledWith(
				null,
				'',
				'/group/alpha/session/2026-08-16?tabId=highlights'
			);
		});

		it('leaves the URL alone on first paint, before any tab is selected', () => {
			renderHook(() =>
				useLinkableTabs({
					tabIds,
					defaultTabId: 'species',
					initialTabId: 'highlights'
				})
			);
			expect(replaceState).not.toHaveBeenCalled();
		});
	});
});
