import { describe, it, expect, afterEach } from 'vitest';
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
});
