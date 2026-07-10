import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';
import recentSessionsSnapshot from '@/test-fixtures/snapshots/fetchRecentSessions.alpha.json';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

vi.mock('@/app/actions/top-performers', () => ({
	getTopStats: vi.fn().mockResolvedValue([])
}));

function makeChainClient(data: unknown) {
	const thenable = {
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data, error: null }).then(resolve)
	};
	const chain = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		...thenable
	};
	return { from: vi.fn().mockReturnValue(chain) };
}

describe('home page', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(() => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(
			makeChainClient(recentSessionsSnapshot)
		);
	});

	it('renders Recent Sessions heading', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', {
			name: 'Recent Sessions'
		});
		expect(heading).toBeDefined();
	});

	it('renders stats accordion', async () => {
		render(await Page());
		const accordions = await screen.findAllByTestId('stats-accordion-group');
		expect(accordions.length).toBeGreaterThan(0);
	});

	it('renders session links from fixture', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', {
			name: 'Recent Sessions'
		});
		const sessionLinks =
			heading.nextElementSibling?.querySelectorAll('a') ?? [];
		expect(sessionLinks.length).toBe(recentSessionsSnapshot.length);
	});

	describe('with no recent sessions', () => {
		it('renders empty session list', async () => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeChainClient([]));
			render(await Page());
			const heading = await screen.findByRole('heading', {
				name: 'Recent Sessions'
			});
			const sessionLinks =
				heading.nextElementSibling?.querySelectorAll('a') ?? [];
			expect(sessionLinks.length).toBe(0);
		});
	});

	describe('with multiple sessions on the same date', () => {
		it('renders all sessions from the last 3 distinct dates', async () => {
			const sessionsWithSharedDate = [
				{
					id: 1,
					visit_date: '2024-05-10',
					location_id: 1,
					ringing_group_id: 3,
					location: { location_name: 'Site A' },
					encounters: [{ count: 4 }]
				},
				{
					id: 2,
					visit_date: '2024-05-10',
					location_id: 2,
					ringing_group_id: 3,
					location: { location_name: 'Site B' },
					encounters: [{ count: 2 }]
				},
				{
					id: 3,
					visit_date: '2024-04-15',
					location_id: 1,
					ringing_group_id: 3,
					location: { location_name: 'Site A' },
					encounters: [{ count: 1 }]
				},
				{
					id: 4,
					visit_date: '2024-03-20',
					location_id: 1,
					ringing_group_id: 3,
					location: { location_name: 'Site A' },
					encounters: [{ count: 3 }]
				}
			];
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeChainClient(sessionsWithSharedDate)
			);
			render(await Page());
			const heading = await screen.findByRole('heading', {
				name: 'Recent Sessions'
			});
			const sessionLinks =
				heading.nextElementSibling?.querySelectorAll('a') ?? [];
			// 2 sessions on same date: 1 day-total link (StatOutput) + 2 site links
			// + 1 link each for the 2 single-session dates = 5 total
			expect(sessionLinks.length).toBe(5);
		});
	});
});
