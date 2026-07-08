import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';
import birdFixture from '@/test-fixtures/snapshots/fetchBirdData.ARRETRAP.json';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const birdData = {
	id: birdFixture.id,
	ring_no: birdFixture.ring_no,
	proven_age: birdFixture.proven_age,
	species: birdFixture.species
};

const encountersData = birdFixture.encounters;

function makeBirdDetailClient() {
	const makeBirdChain = () => ({
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data: birdData, error: null }).then(resolve)
	});
	const makeEncounterChain = () => ({
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data: encountersData, error: null }).then(resolve)
	});
	return {
		from: vi.fn()
			.mockReturnValueOnce(makeBirdChain())
			.mockReturnValueOnce(makeEncounterChain())
	};
}

describe('bird detail page', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(() => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeBirdDetailClient());
	});

	it('renders species name and ring number as heading', async () => {
		render(await Page({ params: Promise.resolve({ ring: birdFixture.ring_no }) }));
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toContain(birdFixture.species.species_name);
		expect(heading.textContent).toContain(birdFixture.ring_no);
	});

	it('renders encounter count in stats', async () => {
		render(await Page({ params: Promise.resolve({ ring: birdFixture.ring_no }) }));
		const stats = await screen.findByTestId('bird-stats');
		expect(stats.textContent).toContain(`${encountersData.length} encounters`);
	});

	it('renders one table row per encounter', async () => {
		render(await Page({ params: Promise.resolve({ ring: birdFixture.ring_no }) }));
		const table = await screen.findByTestId('single-bird-table');
		const rows = table.querySelectorAll('tbody tr');
		expect(rows.length).toBe(encountersData.length);
	});
});
