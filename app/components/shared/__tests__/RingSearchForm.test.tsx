import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor
} from '@testing-library/react';
import { RingSearchForm } from '../RingSearchForm';

const { mockPush, mockResolveRingSearchDestination } = vi.hoisted(() => ({
	mockPush: vi.fn(),
	mockResolveRingSearchDestination: vi.fn()
}));

vi.mock('next/navigation', () => ({
	useRouter: () => ({
		push: mockPush,
		replace: vi.fn(),
		refresh: vi.fn(),
		back: vi.fn(),
		forward: vi.fn(),
		prefetch: vi.fn()
	})
}));

vi.mock('@/app/actions/ring-search', () => ({
	resolveRingSearchDestination: mockResolveRingSearchDestination
}));

function search(ring: string) {
	const input = screen.getByRole('textbox', { name: /ring number/i });
	fireEvent.change(input, { target: { value: ring } });
	fireEvent.click(screen.getByRole('button', { name: /search/i }));
}

describe('RingSearchForm', () => {
	afterEach(cleanup);
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('usual cases', () => {
		it('navigates to the resolved destination for an exact-match ring', async () => {
			mockResolveRingSearchDestination.mockResolvedValue({
				isExactMatch: true,
				path: '/bird/AR0021'
			});
			render(<RingSearchForm />);

			search('AR0021');

			await waitFor(() => {
				expect(mockPush).toHaveBeenCalledWith('/bird/AR0021');
			});
			expect(mockResolveRingSearchDestination).toHaveBeenCalledWith('AR0021');
		});

		it('navigates to the resolved destination when no ring matches exactly', async () => {
			mockResolveRingSearchDestination.mockResolvedValue({
				isExactMatch: false,
				path: '/search?q=AR00'
			});
			render(<RingSearchForm />);

			search('AR00');

			await waitFor(() => {
				expect(mockPush).toHaveBeenCalledWith('/search?q=AR00');
			});
		});
	});

	describe('edge cases', () => {
		// Regression test for #950: repeating the search flow used to
		// sometimes leave the user on the *previous* search's destination
		// instead of navigating to the one just searched for. Since each
		// submit now resolves its own destination directly (rather than both
		// searches racing through a shared `/search` client-side navigation),
		// the second search's own resolved target must always be what's
		// navigated to — never the first search's.
		it('respects the second search of two in sequence, not the first', async () => {
			mockResolveRingSearchDestination
				.mockResolvedValueOnce({ isExactMatch: true, path: '/bird/AR0021' })
				.mockResolvedValueOnce({ isExactMatch: true, path: '/bird/AR0020' });
			render(<RingSearchForm />);

			search('AR0021');
			await waitFor(() => {
				expect(mockPush).toHaveBeenNthCalledWith(1, '/bird/AR0021');
			});

			search('AR0020');
			await waitFor(() => {
				expect(mockPush).toHaveBeenNthCalledWith(2, '/bird/AR0020');
			});

			expect(mockPush).toHaveBeenCalledTimes(2);
		});

		it('ignores a first search resolving after a second, already-navigated one', async () => {
			let resolveFirst!: (value: {
				isExactMatch: boolean;
				path: string;
			}) => void;
			const firstPending = new Promise<{ isExactMatch: boolean; path: string }>(
				(resolve) => {
					resolveFirst = resolve;
				}
			);
			mockResolveRingSearchDestination
				.mockReturnValueOnce(firstPending)
				.mockResolvedValueOnce({ isExactMatch: true, path: '/bird/AR0020' });
			render(<RingSearchForm />);

			search('AR0021');
			search('AR0020');

			await waitFor(() => {
				expect(mockPush).toHaveBeenCalledWith('/bird/AR0020');
			});
			expect(mockPush).toHaveBeenCalledTimes(1);

			// The first search's own destination resolving late must not
			// clobber the second search's already-applied navigation.
			resolveFirst({ isExactMatch: true, path: '/bird/AR0021' });
			await firstPending;
			expect(mockPush).toHaveBeenCalledTimes(1);
			expect(mockPush).toHaveBeenCalledWith('/bird/AR0020');
		});
	});
});
