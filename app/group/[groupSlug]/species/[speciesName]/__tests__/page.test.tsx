import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { notFound } from 'next/navigation';
import CrossGroupSingleSpeciesPage from '../page';

const { mockResolveGroupIdBySlug } = vi.hoisted(() => ({
	mockResolveGroupIdBySlug: vi.fn()
}));

vi.mock('@/lib/group-slug', () => ({
	resolveGroupIdBySlug: mockResolveGroupIdBySlug
}));

// Local override of the global next/navigation mock (vitest.setup.tsx) — this
// wrapper now also needs notFound().
vi.mock('next/navigation', () => ({
	notFound: vi.fn()
}));

vi.mock('@/app/(routes)/species/[speciesName]/page', () => ({
	default: vi.fn(() => <div data-testid="mock-species-page" />)
}));

import SpeciesPage from '@/app/(routes)/species/[speciesName]/page';

describe('cross-group single-species page', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describe('a known groupSlug', () => {
		beforeEach(() => {
			mockResolveGroupIdBySlug.mockResolvedValue(2);
		});

		it('passes viewedGroup matching { id, slug } resolved from resolveGroupIdBySlug to the underlying route page', async () => {
			render(
				await CrossGroupSingleSpeciesPage({
					params: Promise.resolve({
						groupSlug: 'viewed-group-slug',
						speciesName: 'Robin'
					})
				})
			);
			screen.getByTestId('mock-species-page');

			expect(mockResolveGroupIdBySlug).toHaveBeenCalledWith(
				'viewed-group-slug'
			);
			expect(vi.mocked(SpeciesPage).mock.calls[0][0]).toEqual(
				expect.objectContaining({
					viewedGroup: { id: 2, slug: 'viewed-group-slug' }
				})
			);
		});
	});

	describe('an unknown groupSlug', () => {
		beforeEach(() => {
			mockResolveGroupIdBySlug.mockResolvedValue(null);
			vi.mocked(notFound).mockImplementationOnce(() => {
				throw new Error('NEXT_NOT_FOUND');
			});
		});

		it('calls notFound() instead of rendering the route page', async () => {
			await expect(
				CrossGroupSingleSpeciesPage({
					params: Promise.resolve({
						groupSlug: 'no-such-group',
						speciesName: 'Robin'
					})
				})
			).rejects.toThrow('NEXT_NOT_FOUND');

			expect(vi.mocked(notFound)).toHaveBeenCalled();
			expect(vi.mocked(SpeciesPage)).not.toHaveBeenCalled();
		});
	});
});
