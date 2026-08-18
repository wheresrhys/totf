import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
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

	it('excludes non-FULL_GROWN sessions from the query', async () => {
		const client = makeChainClient(alphaSessionsSnapshot);
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
		render(await Page());
		await screen.findByRole('heading', { level: 1 });
		const chain = client.from.mock.results[0].value;
		expect(chain.eq).toHaveBeenCalledWith('session_type', 'FULL_GROWN');
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

		it('renders a session-day link using the group slug, not the numeric id', async () => {
			render(await Page());
			await screen.findAllByRole('heading', { level: 2 });
			const monthButton = screen
				.getAllByRole('button')
				.find((btn) => /[a-z]+: \d+ sessions/i.test(btn.textContent ?? ''));
			expect(monthButton).toBeDefined();
			fireEvent.click(monthButton as HTMLElement);
			const sessionLinks = await screen.findAllByRole('link', {
				name: /\w+ \d+(st|nd|rd|th)/
			});
			const dayLinks = sessionLinks.filter((link) =>
				link.getAttribute('href')?.includes('/session/')
			);
			expect(dayLinks.length).toBeGreaterThan(0);
			dayLinks.forEach((link) => {
				expect(link.getAttribute('href')).toMatch(/^\/group\/alpha\/session\//);
			});
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
