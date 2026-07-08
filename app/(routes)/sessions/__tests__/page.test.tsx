import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';
import alphaSessionsSnapshot from '@/test-fixtures/snapshots/fetchAllSessions.alpha.json';
import betaSessionsSnapshot from '@/test-fixtures/snapshots/fetchAllSessions.beta.json';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
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
		...thenable
	};
	return { from: vi.fn().mockReturnValue(chain) };
}

describe('sessions page', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders "Session history" heading', async () => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(
			makeChainClient(alphaSessionsSnapshot)
		);
		render(await Page());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('Session history');
	});

	describe('with multi-year data (alpha fixture)', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeChainClient(alphaSessionsSnapshot)
			);
		});

		it('renders sessions grouped by year', async () => {
			render(await Page());
			const yearHeadings = await screen.findAllByRole('heading', { level: 2 });
			expect(yearHeadings.length).toBeGreaterThan(1);
			yearHeadings.forEach((h) => expect(h.textContent).toMatch(/^\d{4}$/));
		});

		it('renders sessions grouped by month within year', async () => {
			render(await Page());
			await screen.findAllByRole('heading', { level: 2 });
			const monthButtons = screen
				.getAllByRole('button')
				.filter((btn) => /[a-z]+: \d+ sessions/i.test(btn.textContent ?? ''));
			expect(monthButtons.length).toBeGreaterThan(0);
		});
	});

	describe('with single-year data (beta fixture)', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeChainClient(betaSessionsSnapshot)
			);
		});

		it('renders sessions for a single year only', async () => {
			render(await Page());
			const yearHeadings = await screen.findAllByRole('heading', { level: 2 });
			expect(yearHeadings).toHaveLength(1);
		});
	});

	describe('with no sessions', () => {
		it('renders "No session data available." message', async () => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeChainClient([]));
			render(await Page());
			await screen.findByText('No session data available.');
		});
	});
});
