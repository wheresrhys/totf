import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import Page from '../page';

const { mockGetAuthenticatedSupabaseClient, mockRedirect } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn(),
	mockRedirect: vi.fn()
}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

vi.mock('next/navigation', () => ({
	useRouter: () => ({
		push: vi.fn(),
		replace: vi.fn(),
		refresh: vi.fn(),
		back: vi.fn(),
		forward: vi.fn(),
		prefetch: vi.fn()
	}),
	usePathname: () => '/',
	useSearchParams: () => new URLSearchParams(),
	redirect: mockRedirect
}));

type FuzzyResult = {
	ring_no: string;
	species_name: string;
	closeness_score: number;
};

function makeBirdSearchClient({
	exactMatch,
	fuzzyResults
}: {
	exactMatch: { id: number } | null;
	fuzzyResults: FuzzyResult[];
}) {
	const fromChain = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data: exactMatch, error: null }).then(resolve)
	};
	const rpcThenable = {
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data: fuzzyResults, error: null }).then(resolve)
	};
	return {
		from: vi.fn().mockReturnValue(fromChain),
		rpc: vi.fn().mockReturnValue(rpcThenable)
	};
}

function renderBirdPage(q: string) {
	return Page({ searchParams: Promise.resolve({ q }) });
}

describe('bird search page', () => {
	afterEach(() => {
		cleanup();
		mockRedirect.mockReset();
	});

	describe('with query param matching no rings', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeBirdSearchClient({ exactMatch: null, fuzzyResults: [] })
			);
		});

		it('renders "No exact match found" message', async () => {
			render(await renderBirdPage('UNKNOWN'));
			await screen.findByText(/No exact match found/);
		});

		it('renders empty results list', async () => {
			render(await renderBirdPage('UNKNOWN'));
			await screen.findByText(/No exact match found/);
			const list = screen.getByRole('list');
			expect(list.querySelectorAll('li').length).toBe(0);
		});
	});

	describe('with query param matching fuzzy results', () => {
		const fuzzyResults: FuzzyResult[] = [
			{ ring_no: 'ABC123', species_name: 'Robin', closeness_score: 0.9 },
			{ ring_no: 'ABC456', species_name: 'Blue Tit', closeness_score: 0.7 }
		];

		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeBirdSearchClient({ exactMatch: null, fuzzyResults })
			);
		});

		it('renders list of fuzzy match results with ring numbers', async () => {
			render(await renderBirdPage('ABC'));
			const list = await screen.findByRole('list');
			const items = list.querySelectorAll('li');
			expect(items.length).toBe(fuzzyResults.length);
			expect(items[0].textContent).toContain('ABC123');
			expect(items[1].textContent).toContain('ABC456');
		});
	});

	describe('with query matching exact ring', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeBirdSearchClient({
					exactMatch: { id: 42 },
					fuzzyResults: []
				})
			);
		});

		it('calls redirect to /bird/[ring]', async () => {
			render(await renderBirdPage('RING123'));
			await waitFor(() => {
				expect(mockRedirect).toHaveBeenCalledWith('/bird/RING123');
			});
		});
	});
});
