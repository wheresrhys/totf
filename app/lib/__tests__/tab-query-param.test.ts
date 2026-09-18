import { describe, it, expect } from 'vitest';
import { resolveInitialTabId, readTabIdSearchParam } from '../tab-query-param';

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
