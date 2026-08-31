import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	waitFor,
	fireEvent
} from '@testing-library/react';
import { RingSequenceDetail } from '../RingSequenceDetail';
import type { RingSequenceBirdRow } from '@/app/actions/ring-sequences';

vi.mock('@/app/actions/ring-sequences', () => ({
	fetchRingSequences: vi.fn(),
	fetchRingSequenceBirds: vi.fn(),
	updateRingSequence: vi.fn()
}));

const mockBirdRows: RingSequenceBirdRow[] = [
	{ ring_no: 'ARW000001', species_name: 'Robin', ringed_date: '2022-06-15' },
	{ ring_no: 'ARW000002', species_name: 'Robin', ringed_date: '2022-06-15' },
	{ ring_no: 'ARW000004', species_name: 'Blue Tit', ringed_date: '2023-04-01' }
];

const detailModel = { id: 42, prefix: 'ARW' };
const accordionId = '42';

describe('RingSequenceDetail', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('fetches detail data by ring sequence id when expanded', async () => {
		const { fetchRingSequenceBirds } =
			await import('@/app/actions/ring-sequences');
		vi.mocked(fetchRingSequenceBirds).mockResolvedValue(mockBirdRows);

		render(<RingSequenceDetail model={detailModel} expandedId={accordionId} />);

		await waitFor(() => {
			expect(vi.mocked(fetchRingSequenceBirds)).toHaveBeenCalledWith(42);
		});
	});

	it('renders nothing when not expanded', () => {
		render(<RingSequenceDetail model={detailModel} expandedId="other-id" />);
		expect(screen.queryByTestId('unused-rings')).toBeNull();
	});

	it('shows unused rings when there are gaps in the sequence', async () => {
		const { fetchRingSequenceBirds } =
			await import('@/app/actions/ring-sequences');
		vi.mocked(fetchRingSequenceBirds).mockResolvedValue(mockBirdRows);

		render(<RingSequenceDetail model={detailModel} expandedId={accordionId} />);

		await waitFor(() => {
			expect(screen.getByTestId('unused-rings')).toBeDefined();
		});
		expect(screen.getByTestId('unused-rings').textContent).toContain(
			'ARW000003'
		);
	});

	it('does not show unused rings section when no gaps exist', async () => {
		const { fetchRingSequenceBirds } =
			await import('@/app/actions/ring-sequences');
		const contiguousRows: RingSequenceBirdRow[] = [
			{ ring_no: 'ARW000001', species_name: 'Robin', ringed_date: '2022-06-15' },
			{ ring_no: 'ARW000002', species_name: 'Robin', ringed_date: '2022-06-16' }
		];
		vi.mocked(fetchRingSequenceBirds).mockResolvedValue(contiguousRows);

		render(<RingSequenceDetail model={detailModel} expandedId={accordionId} />);

		await waitFor(() => {
			expect(screen.queryByTestId('unused-rings')).toBeNull();
		});
	});

	it('groups rings by species in a sub-accordion', async () => {
		const { fetchRingSequenceBirds } =
			await import('@/app/actions/ring-sequences');
		vi.mocked(fetchRingSequenceBirds).mockResolvedValue(mockBirdRows);

		render(<RingSequenceDetail model={detailModel} expandedId={accordionId} />);

		await waitFor(() => {
			expect(screen.getByText(/Robin/)).toBeDefined();
			expect(screen.getByText(/Blue Tit/)).toBeDefined();
		});
	});

	it('shows ring count in species heading', async () => {
		const { fetchRingSequenceBirds } =
			await import('@/app/actions/ring-sequences');
		vi.mocked(fetchRingSequenceBirds).mockResolvedValue(mockBirdRows);

		render(<RingSequenceDetail model={detailModel} expandedId={accordionId} />);

		await waitFor(() => {
			const robinHeading = screen
				.getAllByText(/Robin/)
				.find((el) => el.closest('button') !== null);
			expect(robinHeading?.closest('button')?.textContent).toContain('(2)');
		});
	});

	it('shows individual ring numbers and dates when species sub-item expanded', async () => {
		const { fetchRingSequenceBirds } =
			await import('@/app/actions/ring-sequences');
		vi.mocked(fetchRingSequenceBirds).mockResolvedValue(mockBirdRows);

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
