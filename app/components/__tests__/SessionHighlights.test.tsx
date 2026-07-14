import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { SessionHighlights } from '../SessionHighlights';
import type { SessionHighlight } from '@/app/models/session-highlights';

vi.mock('@/app/actions/session-highlights', () => ({
	fetchSessionHighlights: vi.fn()
}));

const mockHighlights: SessionHighlight[] = [
	{
		type: 'session-total-record',
		metric: 'encounters',
		scope: 'all-time',
		value: 74,
		seasonName: 'autumn',
		year: 2024,
		isCurrentYear: false,
		isCurrentSeason: false,
		seasonPeriodLabel: 'autumn 2024'
	},
	{
		type: 'session-total-record',
		metric: 'species',
		scope: 'this-season',
		value: 18,
		seasonName: 'autumn',
		year: 2024,
		isCurrentYear: true,
		isCurrentSeason: true,
		seasonPeriodLabel: 'autumn 2024'
	}
];

const mockHighlightsWithSpeciesRecord: SessionHighlight[] = [
	{
		type: 'session-total-record',
		metric: 'encounters',
		scope: 'all-time',
		value: 74,
		seasonName: 'autumn',
		year: 2024,
		isCurrentYear: false,
		isCurrentSeason: false,
		seasonPeriodLabel: 'autumn 2024'
	},
	{
		type: 'species-count-record',
		speciesName: 'Reed Warbler',
		scope: 'all-time',
		value: 12,
		seasonName: 'autumn',
		year: 2024,
		isCurrentYear: false,
		isCurrentSeason: false,
		seasonPeriodLabel: 'autumn 2024'
	}
];

describe('SessionHighlights', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	beforeEach(async () => {
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue(mockHighlights);
	});

	it('renders a loading spinner before data loads', async () => {
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		let resolveData!: (v: SessionHighlight[]) => void;
		vi.mocked(fetchSessionHighlights).mockReturnValue(
			new Promise((resolve) => {
				resolveData = resolve;
			})
		);
		render(<SessionHighlights date="2024-09-15" viewedGroupId={1} />);
		expect(document.querySelector('.loading')).not.toBeNull();
		resolveData(mockHighlights);
	});

	it('renders a Highlights heading and one item per highlight', async () => {
		render(<SessionHighlights date="2024-09-15" viewedGroupId={1} />);
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Highlights' })).toBeDefined();
		});
		const items = screen
			.getByTestId('session-highlights')
			.querySelectorAll('li');
		expect(items.length).toBe(2);
		expect(items[0].textContent).toBe('Busiest session ever — 74 birds');
		expect(items[1].textContent).toBe(
			'Most varied session this autumn — 18 species'
		);
	});

	it('renders nothing when there are no highlights', async () => {
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue([]);
		const { container } = render(
			<SessionHighlights date="2024-09-15" viewedGroupId={1} />
		);
		await waitFor(() => {
			expect(document.querySelector('.loading')).toBeNull();
		});
		expect(container.innerHTML).toBe('');
	});

	it('renders nothing when the action rejects', async () => {
		const consoleErrorSpy = vi
			.spyOn(console, 'error')
			.mockImplementation(() => {});
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockRejectedValue(
			new Error('action failed')
		);
		const { container } = render(
			<SessionHighlights date="2024-09-15" viewedGroupId={1} />
		);
		await waitFor(() => {
			expect(document.querySelector('.loading')).toBeNull();
		});
		expect(container.innerHTML).toBe('');
		expect(consoleErrorSpy).toHaveBeenCalled();
	});

	it('renders species record sentences alongside session-total records', async () => {
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue(
			mockHighlightsWithSpeciesRecord
		);
		render(<SessionHighlights date="2024-09-15" viewedGroupId={1} />);
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Highlights' })).toBeDefined();
		});
		const items = screen
			.getByTestId('session-highlights')
			.querySelectorAll('li');
		expect(items.length).toBe(2);
		expect(items[0].textContent).toBe('Busiest session ever — 74 birds');
		expect(items[1].textContent).toBe(
			'Record day for Reed Warbler — 12 caught, the most ever'
		);
	});
});
