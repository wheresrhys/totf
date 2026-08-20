import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import CrossGroupSingleSpeciesPage from '../page';

const { mockResolveGroupSlugById } = vi.hoisted(() => ({
	mockResolveGroupSlugById: vi.fn()
}));

vi.mock('@/lib/group-slug', () => ({
	resolveGroupSlugById: mockResolveGroupSlugById
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

	beforeEach(() => {
		mockResolveGroupSlugById.mockResolvedValue('viewed-group-slug');
	});

	it('passes viewedGroup matching { id, slug } resolved from resolveGroupSlugById to the underlying route page', async () => {
		render(
			await CrossGroupSingleSpeciesPage({
				params: Promise.resolve({ groupId: '2', speciesName: 'Robin' })
			})
		);
		screen.getByTestId('mock-species-page');

		expect(mockResolveGroupSlugById).toHaveBeenCalledWith(2);
		expect(vi.mocked(SpeciesPage).mock.calls[0][0]).toEqual(
			expect.objectContaining({
				viewedGroup: { id: 2, slug: 'viewed-group-slug' }
			})
		);
	});
});
