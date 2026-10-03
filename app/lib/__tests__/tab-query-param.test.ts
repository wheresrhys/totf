import { describe, it, expect } from 'vitest';
import {
	resolveInitialTabId,
	readTabIdSearchParam,
	setTabIdSearchParam,
	appendTabIdSearchParam
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

describe('setTabIdSearchParam', () => {
	describe('Usual', () => {
		it('stamps the tab onto an absolute URL with no query string, returning it root-relative', () => {
			expect(
				setTabIdSearchParam(
					'https://totf.test/group/alpha/summary/2026',
					'month-totals'
				)
			).toBe('/group/alpha/summary/2026?tabId=month-totals');
		});
	});

	describe('Structure', () => {
		it('keeps every other search param, appending tabId after them', () => {
			expect(
				setTabIdSearchParam(
					'https://totf.test/compare/species?name=Robin&name=Wren',
					'bird-list'
				)
			).toBe('/compare/species?name=Robin&name=Wren&tabId=bird-list');
		});

		it('overwrites an existing tabId in place rather than appending a second one', () => {
			expect(
				setTabIdSearchParam(
					'https://totf.test/summary?tabId=year-totals&foo=bar',
					'species-totals'
				)
			).toBe('/summary?tabId=species-totals&foo=bar');
		});

		it('preserves the hash, after the rewritten query string', () => {
			expect(
				setTabIdSearchParam('https://totf.test/summary#totals', 'year-totals')
			).toBe('/summary?tabId=year-totals#totals');
		});
	});
});

describe('appendTabIdSearchParam', () => {
	describe('Usual', () => {
		it('appends the current tab to a bare internal path', () => {
			expect(appendTabIdSearchParam('/species/Robin', 'biometrics')).toBe(
				'/species/Robin?tabId=biometrics'
			);
		});
	});

	describe('Structure', () => {
		it('keeps an existing query string, appending tabId after it', () => {
			expect(appendTabIdSearchParam('/species/Robin?page=2', 'bird-list')).toBe(
				'/species/Robin?page=2&tabId=bird-list'
			);
		});

		it('preserves the hash, keeping it after the query string', () => {
			expect(appendTabIdSearchParam('/species/Robin#notes', 'bird-list')).toBe(
				'/species/Robin?tabId=bird-list#notes'
			);
		});
	});

	describe('Edge', () => {
		it('leaves the href untouched when there is no current tab', () => {
			expect(appendTabIdSearchParam('/species/Robin', undefined)).toBe(
				'/species/Robin'
			);
		});

		it('leaves an href that already names a tabId untouched, so an explicit deep link wins', () => {
			expect(
				appendTabIdSearchParam('/species/Robin?tabId=highlights', 'bird-list')
			).toBe('/species/Robin?tabId=highlights');
		});

		it('leaves an href that is not a root-relative internal path untouched', () => {
			expect(appendTabIdSearchParam('https://bto.org/robin', 'bird-list')).toBe(
				'https://bto.org/robin'
			);
			expect(appendTabIdSearchParam('#totals', 'bird-list')).toBe('#totals');
		});
	});
});
