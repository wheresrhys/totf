import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { act } from 'react';
import { mockIntersectionObserver } from 'jsdom-testing-mocks';
import { SpIndividualsTab } from '../SpIndividualsTab';
import birdsSnapshot from '@/test-fixtures/snapshots/tables/Birds/robin-alpha.page-of-birds.json';
import { enrichBird } from '@/app/models/bird';
import type { EnrichedBirdOfSpecies, BirdOfSpecies } from '@/app/models/bird';

vi.mock('@/app/actions/sp-data', () => ({
	fetchPageOfBirds: vi.fn()
}));

const io = mockIntersectionObserver();

const birds = (birdsSnapshot as BirdOfSpecies[]).map(
	(b) => enrichBird(b) as EnrichedBirdOfSpecies
);

function renderIndividualsTab(
	overrides: Partial<{
		speciesId: number;
		viewedGroupId: number;
		birds: EnrichedBirdOfSpecies[];
		birdCount: number;
		fromDate: string;
		toDate: string;
	}> = {}
) {
	const props = {
		speciesId: 1,
		viewedGroupId: 1,
		birds,
		birdCount: birds.length,
		...overrides
	};
	return render(
		<SpIndividualsTab
			speciesId={props.speciesId}
			viewedGroupId={props.viewedGroupId}
			birds={props.birds}
			birdCount={props.birdCount}
			fromDate={props.fromDate}
			toDate={props.toDate}
		/>
	);
}

describe('SpIndividualsTab', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders bird rows', () => {
		renderIndividualsTab();
		const rows = document.querySelector('tbody')?.querySelectorAll('tr');
		expect(rows?.length).toBe(birds.length);
	});

	it('renders Wing and Weight range columns', () => {
		renderIndividualsTab();
		const headers = [...document.querySelectorAll('th')].map(
			(th) => th.textContent
		);
		expect(headers).toContain('Wing');
		expect(headers).toContain('Weight');
	});

	it('renders a wing range with its bold parenthesised dominant value', () => {
		renderIndividualsTab();
		// ARRETRAP has wing lengths 74–80 with a dominant (majority) value of 75.
		const arretrapRow = [...document.querySelectorAll('tbody tr')].find((row) =>
			row.textContent?.includes('ARRETRAP')
		);
		expect(arretrapRow?.textContent).toContain('74 - 80 (75)');
		expect(
			[...(arretrapRow?.querySelectorAll('strong') ?? [])].map(
				(el) => el.textContent
			)
		).toContain('(75)');
	});

	describe('birdCount prop', () => {
		it('hides infinite scroll loader when birdCount equals loaded birds', () => {
			renderIndividualsTab();
			expect(() => screen.getByTestId('infinite-scroll-loader')).toThrow();
		});

		it('shows infinite scroll loader when birdCount exceeds loaded birds', () => {
			renderIndividualsTab({ birdCount: birds.length + 10 });
			expect(screen.getByTestId('infinite-scroll-loader')).toBeDefined();
		});
	});

	it('loads more birds when scroll loader enters view', async () => {
		const { fetchPageOfBirds } = await import('@/app/actions/sp-data');
		vi.mocked(fetchPageOfBirds).mockResolvedValue(
			birds as Awaited<ReturnType<typeof fetchPageOfBirds>>
		);
		renderIndividualsTab({ birdCount: birds.length + 10 });
		const loader = screen.getByTestId('infinite-scroll-loader');
		await act(async () => {
			io.enterNode(loader);
		});
		expect(vi.mocked(fetchPageOfBirds)).toHaveBeenCalledWith(
			1,
			1,
			1,
			undefined,
			undefined
		);
	});

	it('forwards the from/to date range into paged fetches when scoped', async () => {
		const { fetchPageOfBirds } = await import('@/app/actions/sp-data');
		vi.mocked(fetchPageOfBirds).mockResolvedValue(
			birds as Awaited<ReturnType<typeof fetchPageOfBirds>>
		);
		renderIndividualsTab({
			birdCount: birds.length + 10,
			fromDate: '2026-01-01',
			toDate: '2026-12-31'
		});
		const loader = screen.getByTestId('infinite-scroll-loader');
		await act(async () => {
			io.enterNode(loader);
		});
		expect(vi.mocked(fetchPageOfBirds)).toHaveBeenCalledWith(
			1,
			1,
			1,
			'2026-01-01',
			'2026-12-31'
		);
	});
});
