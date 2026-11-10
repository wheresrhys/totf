import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor,
	act
} from '@testing-library/react';
import { DiscrepancyRowFixButtons } from '../DiscrepancyRowFixButtons';
import { regenerateStatsCache } from '@/app/actions/regenerate-stats-cache';
import type { RegenerateStatsCacheResult } from '@/app/actions/regenerate-stats-cache';
import type { DiscrepancyRowScope } from '../discrepancy-row-fix-scope';

vi.mock('@/app/actions/regenerate-stats-cache', () => ({
	regenerateStatsCache: vi.fn()
}));

const overallRow: DiscrepancyRowScope = {
	temporalUnit: 'month',
	period: '2026-01-01'
};

const bySpeciesRow: DiscrepancyRowScope = { ...overallRow, speciesId: 42 };

function renderButtons(
	overrides: {
		row?: DiscrepancyRowScope;
		isFixRequested?: boolean;
		onFixRequested?: (dispatch: unknown) => void;
	} = {}
) {
	const onFixRequested = overrides.onFixRequested ?? vi.fn();
	render(
		<DiscrepancyRowFixButtons
			row={overrides.row ?? overallRow}
			isFixRequested={overrides.isFixRequested ?? false}
			onFixRequested={onFixRequested}
		/>
	);
	return { onFixRequested };
}

describe('DiscrepancyRowFixButtons', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(regenerateStatsCache).mockResolvedValue({ success: true });
	});

	afterEach(() => {
		cleanup();
	});

	it('renders exactly 2 buttons for an overall (non-species) row', () => {
		renderButtons({ row: overallRow });

		expect(
			screen.getAllByRole('button').map((button) => button.textContent)
		).toEqual(['Fix just this issue', 'Fix for all time periods']);
	});

	it('renders exactly 4 buttons for a by-species row', () => {
		renderButtons({ row: bySpeciesRow });

		expect(
			screen.getAllByRole('button').map((button) => button.textContent)
		).toEqual([
			'Fix just this issue',
			'Fix for all time periods',
			'Fix for all species',
			'Fix for all species and time periods'
		]);
	});

	it('disables every button on the row immediately after any one of them is clicked', async () => {
		let resolveAction!: (result: RegenerateStatsCacheResult) => void;
		vi.mocked(regenerateStatsCache).mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveAction = resolve;
				})
		);
		renderButtons({ row: bySpeciesRow });

		fireEvent.click(
			screen.getByRole('button', { name: 'Fix for all species' })
		);

		await waitFor(() => {
			screen.getAllByRole('button').forEach((button) => {
				expect(button).toHaveProperty('disabled', true);
			});
		});

		await act(async () => {
			resolveAction({ success: true });
		});
	});

	it('calls regenerateStatsCache with the params matching the clicked button', async () => {
		renderButtons({ row: bySpeciesRow });

		fireEvent.click(
			screen.getByRole('button', { name: 'Fix for all time periods' })
		);

		await waitFor(() => {
			expect(regenerateStatsCache).toHaveBeenCalledWith({
				temporalUnit: 'month',
				speciesIds: [42]
			});
		});
	});

	it('calls onFixRequested with the dispatched params once the action resolves successfully', async () => {
		const { onFixRequested } = renderButtons({ row: bySpeciesRow });

		fireEvent.click(
			screen.getByRole('button', { name: 'Fix just this issue' })
		);

		await waitFor(() => {
			expect(onFixRequested).toHaveBeenCalledWith({
				temporalUnit: 'month',
				periods: ['2026-01-01'],
				speciesIds: [42]
			});
		});
	});

	it('re-enables the buttons and shows the error inline when the action resolves with a failure, without calling onFixRequested', async () => {
		vi.mocked(regenerateStatsCache).mockResolvedValue({
			success: false,
			error: 'No group selected'
		});
		const { onFixRequested } = renderButtons({ row: overallRow });

		fireEvent.click(
			screen.getByRole('button', { name: 'Fix just this issue' })
		);

		await waitFor(() => {
			expect(screen.getByRole('alert').textContent).toBe('No group selected');
		});
		screen.getAllByRole('button').forEach((button) => {
			expect(button).toHaveProperty('disabled', false);
		});
		expect(onFixRequested).not.toHaveBeenCalled();
	});

	it('disables the buttons and labels the row "Fix requested" when the list reports the row already covered by a dispatched fix', () => {
		renderButtons({ row: overallRow, isFixRequested: true });

		expect(screen.getByText('Fix requested')).toBeTruthy();
		screen.getAllByRole('button').forEach((button) => {
			expect(button).toHaveProperty('disabled', true);
		});
	});
});
