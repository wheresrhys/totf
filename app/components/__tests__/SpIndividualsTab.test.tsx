import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { act } from 'react';
import { mockIntersectionObserver } from 'jsdom-testing-mocks';
import { SpIndividualsTab } from '../SpIndividualsTab';
import birdsSnapshot from '@/test-fixtures/snapshots/fetchPageOfBirds.alpha.robin.json';
import { enrichBird } from '@/app/models/bird';
import type { EnrichedBirdOfSpecies, BirdOfSpecies } from '@/app/models/bird';

vi.mock('@/app/actions/sp-data', () => ({
	fetchPageOfBirds: vi.fn()
}));

const io = mockIntersectionObserver();

const birds = (birdsSnapshot as unknown as BirdOfSpecies[]).map(
	(b) => enrichBird(b) as EnrichedBirdOfSpecies
);

describe('SpIndividualsTab', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders bird rows', () => {
		render(
			<SpIndividualsTab
				speciesId={1}
				viewedGroupId={1}
				birds={birds}
				birdCount={birds.length}
			/>
		);
		const rows = document.querySelector('tbody')?.querySelectorAll('tr');
		expect(rows?.length).toBe(birds.length);
	});

	it('hides infinite scroll loader when all birds loaded', () => {
		render(
			<SpIndividualsTab
				speciesId={1}
				viewedGroupId={1}
				birds={birds}
				birdCount={birds.length}
			/>
		);
		expect(() => screen.getByTestId('infinite-scroll-loader')).toThrow();
	});

	it('shows infinite scroll loader when more birds remain', () => {
		render(
			<SpIndividualsTab
				speciesId={1}
				viewedGroupId={1}
				birds={birds}
				birdCount={birds.length + 10}
			/>
		);
		expect(screen.getByTestId('infinite-scroll-loader')).toBeDefined();
	});

	it('loads more birds when scroll loader enters view', async () => {
		const { fetchPageOfBirds } = await import('@/app/actions/sp-data');
		vi.mocked(fetchPageOfBirds).mockResolvedValue(
			birds as unknown as Awaited<ReturnType<typeof fetchPageOfBirds>>
		);
		render(
			<SpIndividualsTab
				speciesId={1}
				viewedGroupId={1}
				birds={birds}
				birdCount={birds.length + 10}
			/>
		);
		const loader = screen.getByTestId('infinite-scroll-loader');
		await act(async () => {
			io.enterNode(loader);
		});
		expect(vi.mocked(fetchPageOfBirds)).toHaveBeenCalledWith(1, 1, 1);
	});
});
