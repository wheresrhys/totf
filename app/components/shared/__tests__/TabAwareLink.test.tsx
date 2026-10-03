import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TabAwareLink } from '../TabAwareLink';
import { CurrentTabProvider } from '../CurrentTabContext';

afterEach(() => {
	cleanup();
});

// The href-rewriting rules themselves (existing query strings, hashes, already-
// named tabIds, external hrefs) are `appendTabIdSearchParam`'s own unit tests in
// app/lib/__tests__/tab-query-param.test.ts — these cover only this component's
// one job: reading the enclosing tab out of context and handing it over.
describe('TabAwareLink', () => {
	describe('inside a CurrentTabProvider', () => {
		it('carries the enclosing tab onto the href', () => {
			render(
				<CurrentTabProvider currentTabId="biometrics">
					<TabAwareLink href="/species/Robin">All time</TabAwareLink>
				</CurrentTabProvider>
			);
			expect(
				screen.getByRole('link', { name: 'All time' }).getAttribute('href')
			).toBe('/species/Robin?tabId=biometrics');
		});

		it('passes every other prop through to the underlying link', () => {
			render(
				<CurrentTabProvider currentTabId="biometrics">
					<TabAwareLink href="/species/Robin" className="link text-wrap">
						All time
					</TabAwareLink>
				</CurrentTabProvider>
			);
			expect(
				screen.getByRole('link', { name: 'All time' }).getAttribute('class')
			).toBe('link text-wrap');
		});
	});

	describe('outside any CurrentTabProvider', () => {
		it('leaves the href exactly as given', () => {
			render(<TabAwareLink href="/species/Robin">All time</TabAwareLink>);
			expect(
				screen.getByRole('link', { name: 'All time' }).getAttribute('href')
			).toBe('/species/Robin');
		});
	});
});
