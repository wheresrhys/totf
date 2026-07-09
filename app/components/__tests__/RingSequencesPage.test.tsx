import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	waitFor,
	fireEvent
} from '@testing-library/react';
import { RingSequencesPage } from '../RingSequencesPage';
import type {
	RingSequenceSummary,
	RingSequenceControlRow
} from '@/app/actions/ring-sequences';

vi.mock('@/app/actions/ring-sequences', () => ({
	fetchRingSequenceSummaries: vi.fn(),
	fetchRingSequenceDetail: vi.fn(),
	fetchRingSequenceControls: vi.fn()
}));

const mockSummaries: RingSequenceSummary[] = [
	{
		sequence_prefix: 'ARW',
		ring_length: 9,
		ring_count: 15,
		earliest_date: '2022-06-15',
		latest_date: '2024-05-10'
	},
	{
		sequence_prefix: 'ABT',
		ring_length: 8,
		ring_count: 6,
		earliest_date: '2022-04-30',
		latest_date: '2023-05-12'
	}
];

const mockControls: RingSequenceControlRow[] = [
	{ ring_no: 'SHARED01', species_name: 'Robin', first_date: '2023-06-01' }
];

const viewedGroupId = 1;

describe('RingSequencesPage', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('renders Controls accordion item first', () => {
		render(
			<RingSequencesPage
				params={{}}
				data={mockSummaries}
				viewedGroupId={viewedGroupId}
			/>
		);
		const items = screen.getAllByRole('listitem');
		expect(items[0].getAttribute('data-testid')).toBe('controls-accordion');
	});

	it('renders one accordion item per ring sequence summary', () => {
		render(
			<RingSequencesPage
				params={{}}
				data={mockSummaries}
				viewedGroupId={viewedGroupId}
			/>
		);
		expect(screen.getByTestId('sequence-ARW-9')).toBeDefined();
		expect(screen.getByTestId('sequence-ABT-8')).toBeDefined();
	});

	it('shows sequence prefix, ring count, and date range in heading', () => {
		render(
			<RingSequencesPage
				params={{}}
				data={mockSummaries}
				viewedGroupId={viewedGroupId}
			/>
		);
		const arwItem = screen.getByTestId('sequence-ARW-9');
		expect(arwItem.textContent).toContain('ARW');
		expect(arwItem.textContent).toContain('15 rings');
		expect(arwItem.textContent).toContain('2022-06-15');
		expect(arwItem.textContent).toContain('2024-05-10');
	});

	it('expands Controls item and fetches controls data', async () => {
		const { fetchRingSequenceControls } =
			await import('@/app/actions/ring-sequences');
		vi.mocked(fetchRingSequenceControls).mockResolvedValue(mockControls);

		render(
			<RingSequencesPage
				params={{}}
				data={mockSummaries}
				viewedGroupId={viewedGroupId}
			/>
		);

		fireEvent.click(
			screen.getByTestId('controls-accordion').querySelector('button')!
		);

		await waitFor(() => {
			expect(vi.mocked(fetchRingSequenceControls)).toHaveBeenCalledWith(
				viewedGroupId
			);
		});
	});

	it('displays controls table once data resolves', async () => {
		const { fetchRingSequenceControls } =
			await import('@/app/actions/ring-sequences');
		vi.mocked(fetchRingSequenceControls).mockResolvedValue(mockControls);

		render(
			<RingSequencesPage
				params={{}}
				data={mockSummaries}
				viewedGroupId={viewedGroupId}
			/>
		);

		fireEvent.click(
			screen.getByTestId('controls-accordion').querySelector('button')!
		);

		await waitFor(() => {
			expect(screen.getByTestId('controls-table')).toBeDefined();
		});
		expect(screen.getByText('SHARED01')).toBeDefined();
		expect(screen.getByText('Robin')).toBeDefined();
	});

	it('collapses Controls when a sequence item is expanded', async () => {
		const { fetchRingSequenceControls, fetchRingSequenceDetail } =
			await import('@/app/actions/ring-sequences');
		vi.mocked(fetchRingSequenceControls).mockResolvedValue(mockControls);
		vi.mocked(fetchRingSequenceDetail).mockResolvedValue([]);

		render(
			<RingSequencesPage
				params={{}}
				data={mockSummaries}
				viewedGroupId={viewedGroupId}
			/>
		);

		fireEvent.click(
			screen.getByTestId('controls-accordion').querySelector('button')!
		);
		await waitFor(() => {
			expect(screen.getByTestId('controls-table')).toBeDefined();
		});

		fireEvent.click(
			screen.getByTestId('sequence-ARW-9').querySelector('button')!
		);

		await waitFor(() => {
			expect(screen.queryByTestId('controls-table')).toBeNull();
		});
	});
});
