import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	waitFor,
	fireEvent
} from '@testing-library/react';
import { RingSequenceDetail } from '../RingSequenceDetail';
import type { RingSequenceDetailRow } from '@/app/actions/ring-sequences';

vi.mock('@/app/actions/ring-sequences', () => ({
	fetchRingSequenceSummaries: vi.fn(),
	fetchRingSequenceDetail: vi.fn(),
	fetchRingSequenceControls: vi.fn()
}));

const mockDetailRows: RingSequenceDetailRow[] = [
	{ ring_no: 'ARW000001', species_name: 'Robin', ringed_date: '2022-06-15' },
	{ ring_no: 'ARW000002', species_name: 'Robin', ringed_date: '2022-06-15' },
	{ ring_no: 'ARW000004', species_name: 'Blue Tit', ringed_date: '2023-04-01' }
];

const detailModel = {
	sequencePrefix: 'ARW',
	ringLength: 9,
	viewedGroupId: 1
};

const accordionId = 'ARW-9';

describe('RingSequenceDetail', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('fetches detail data when the item is expanded', async () => {
		const { fetchRingSequenceDetail } =
			await import('@/app/actions/ring-sequences');
		vi.mocked(fetchRingSequenceDetail).mockResolvedValue(mockDetailRows);

		render(<RingSequenceDetail model={detailModel} expandedId={accordionId} />);

		await waitFor(() => {
			expect(vi.mocked(fetchRingSequenceDetail)).toHaveBeenCalledWith(
				'ARW',
				9,
				1
			);
		});
	});

	it('renders nothing when not expanded', () => {
		render(<RingSequenceDetail model={detailModel} expandedId="other-id" />);
		expect(screen.queryByTestId('unused-rings')).toBeNull();
	});

	it('shows unused rings when there are gaps in the sequence', async () => {
		const { fetchRingSequenceDetail } =
			await import('@/app/actions/ring-sequences');
		vi.mocked(fetchRingSequenceDetail).mockResolvedValue(mockDetailRows);

		render(<RingSequenceDetail model={detailModel} expandedId={accordionId} />);

		await waitFor(() => {
			expect(screen.getByTestId('unused-rings')).toBeDefined();
		});
		expect(screen.getByTestId('unused-rings').textContent).toContain(
			'ARW000003'
		);
	});

	it('does not show unused rings section when no gaps exist', async () => {
		const { fetchRingSequenceDetail } =
			await import('@/app/actions/ring-sequences');
		const contiguousRows: RingSequenceDetailRow[] = [
			{
				ring_no: 'ARW000001',
				species_name: 'Robin',
				ringed_date: '2022-06-15'
			},
			{ ring_no: 'ARW000002', species_name: 'Robin', ringed_date: '2022-06-16' }
		];
		vi.mocked(fetchRingSequenceDetail).mockResolvedValue(contiguousRows);

		render(<RingSequenceDetail model={detailModel} expandedId={accordionId} />);

		await waitFor(() => {
			expect(screen.queryByTestId('unused-rings')).toBeNull();
		});
	});

	it('groups rings by species in a sub-accordion', async () => {
		const { fetchRingSequenceDetail } =
			await import('@/app/actions/ring-sequences');
		vi.mocked(fetchRingSequenceDetail).mockResolvedValue(mockDetailRows);

		render(<RingSequenceDetail model={detailModel} expandedId={accordionId} />);

		await waitFor(() => {
			expect(screen.getByText(/Robin/)).toBeDefined();
			expect(screen.getByText(/Blue Tit/)).toBeDefined();
		});
	});

	it('shows ring count in species heading', async () => {
		const { fetchRingSequenceDetail } =
			await import('@/app/actions/ring-sequences');
		vi.mocked(fetchRingSequenceDetail).mockResolvedValue(mockDetailRows);

		render(<RingSequenceDetail model={detailModel} expandedId={accordionId} />);

		await waitFor(() => {
			const robinHeading = screen
				.getAllByText(/Robin/)
				.find((el) => el.closest('button') !== null);
			expect(robinHeading?.closest('button')?.textContent).toContain('(2)');
		});
	});

	it('shows individual ring numbers and dates when species sub-item expanded', async () => {
		const { fetchRingSequenceDetail } =
			await import('@/app/actions/ring-sequences');
		vi.mocked(fetchRingSequenceDetail).mockResolvedValue(mockDetailRows);

		render(<RingSequenceDetail model={detailModel} expandedId={accordionId} />);

		await waitFor(() => {
			expect(screen.getByText('Robin')).toBeDefined();
		});

		const robinButtons = screen
			.getAllByRole('button')
			.filter((btn) => btn.textContent?.includes('Robin'));
		fireEvent.click(robinButtons[0]);

		await waitFor(() => {
			expect(screen.getByText('ARW000001')).toBeDefined();
			expect(screen.getByText('ARW000002')).toBeDefined();
		});
	});
});
