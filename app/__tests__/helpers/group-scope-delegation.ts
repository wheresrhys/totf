import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { notFound } from 'next/navigation';

/**
 * Shared "known groupSlug delegates" / "unknown groupSlug calls notFound()"
 * test factory for `withGroupScope`-wrapped `Group___Page` components
 * (app/(routes)/group/[groupSlug]/**). Every one of these pages repeats the
 * same two behaviours — see `withGroupScope` (app/components/layout/withGroupScope.tsx)
 * for what it factors out on the implementation side. This factory factors
 * out the corresponding test boilerplate; call it from inside each page's own
 * `describe` block, alongside any genuinely page-specific tests (e.g. the
 * home page's redirect-to-own-group case) written out locally.
 *
 * The caller is still responsible for its own `vi.mock(...)` calls (module
 * paths are static per test file and can't be parametrized) and its own
 * `afterEach(() => { cleanup(); vi.clearAllMocks(); })` — only the `it`s
 * themselves are shared here.
 */
export function describeGroupScopeDelegation<
	ExtraParams extends Record<string, string> = Record<string, never>
>({
	renderGroupPage,
	mockResolveGroupIdBySlug,
	DelegatePage,
	testId,
	extraParams = {} as ExtraParams,
	beforeEachSetup
}: {
	/** Calls the `withGroupScope`-wrapped page under test with the given route params. */
	renderGroupPage: (
		params: { groupSlug: string } & ExtraParams
	) => ReactNode | Promise<ReactNode>;
	/** The `vi.fn()` mock backing `resolveGroupIdBySlug` (from `@/app/lib/group-slug`). */
	mockResolveGroupIdBySlug: ReturnType<typeof vi.fn>;
	/** The mocked underlying (non-group-scoped) route page component being delegated to. */
	DelegatePage: (...args: never[]) => unknown;
	/** `data-testid` the mocked `DelegatePage` renders, confirming it mounted. */
	testId: string;
	/** Extra (non-`groupSlug`) route params this page's `withGroupScope` call declares, e.g. `{ year: '2025' }`. */
	extraParams?: ExtraParams;
	/** Extra per-page setup to run alongside the shared beforeEach (e.g. stubbing `getGroupCookie` for the home page's redirect check). */
	beforeEachSetup?: () => void;
}) {
	describe('a known groupSlug', () => {
		beforeEach(() => {
			beforeEachSetup?.();
			mockResolveGroupIdBySlug.mockResolvedValue(2);
		});

		it('passes viewedGroup matching { id, slug } resolved from resolveGroupIdBySlug to the underlying route page', async () => {
			render(
				await renderGroupPage({
					groupSlug: 'viewed-group-slug',
					...extraParams
				})
			);
			screen.getByTestId(testId);

			expect(mockResolveGroupIdBySlug).toHaveBeenCalledWith(
				'viewed-group-slug'
			);
			expect(vi.mocked(DelegatePage).mock.calls[0][0]).toEqual(
				expect.objectContaining({
					viewedGroup: { id: 2, slug: 'viewed-group-slug' }
				})
			);

			if (Object.keys(extraParams).length > 0) {
				const { params } = vi.mocked(DelegatePage).mock.calls[0][0] as {
					params: Promise<ExtraParams>;
				};
				await expect(params).resolves.toEqual(extraParams);
			}
		});
	});

	describe('an unknown groupSlug', () => {
		beforeEach(() => {
			beforeEachSetup?.();
			mockResolveGroupIdBySlug.mockResolvedValue(null);
			vi.mocked(notFound).mockImplementationOnce(() => {
				throw new Error('NEXT_NOT_FOUND');
			});
		});

		it('calls notFound() instead of rendering the route page', async () => {
			await expect(
				renderGroupPage({ groupSlug: 'no-such-group', ...extraParams })
			).rejects.toThrow('NEXT_NOT_FOUND');

			expect(vi.mocked(notFound)).toHaveBeenCalled();
			expect(vi.mocked(DelegatePage)).not.toHaveBeenCalled();
		});
	});
}
