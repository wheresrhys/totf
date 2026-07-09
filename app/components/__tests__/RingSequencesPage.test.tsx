import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RingSequencesPage } from '../RingSequencesPage';
import type { RingSequenceSummary } from '@/app/actions/ring-sequences';

vi.mock('@/app/actions/ring-sequences', () => ({
	fetchRingSequenceSummaries: vi.fn(),
	fetchRingSequenceDetail: vi.fn()
}));

// AA (3-alpha, length 6), A (3-alpha, length 7), Large (3-alpha, length 9)
const mockSummaries: RingSequenceSummary[] = [
	{
		sequence_prefix: 'ARW',
		ring_length: 6,
		ring_count: 10,
		earliest_date: '2022-06-15',
		latest_date: '2024-05-10'
	},
	{
		sequence_prefix: 'ARW',
		ring_length: 7,
		ring_count: 15,
		earliest_date: '2022-06-15',
		latest_date: '2024-05-10'
	},
	{
		sequence_prefix: 'ABT',
		ring_length: 7,
		ring_count: 6,
		earliest_date: '2022-04-30',
		latest_date: '2023-05-12'
	},
	{
		sequence_prefix: 'ARW',
		ring_length: 9,
		ring_count: 8,
		earliest_date: '2021-03-01',
		latest_date: '2023-07-20'
	}
];

const viewedGroupId = 1;

describe('RingSequencesPage', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('renders a section heading per populated ring size', () => {
		render(
			<RingSequencesPage
				params={{}}
				data={mockSummaries}
				viewedGroupId={viewedGroupId}
			/>
		);
		expect(screen.getByTestId('ring-size-AA')).toBeDefined();
		expect(screen.getByTestId('ring-size-A')).toBeDefined();
		expect(screen.getByTestId('ring-size-Large')).toBeDefined();
	});

	it('heading shows ring size name and total ring count', () => {
		render(
			<RingSequencesPage
				params={{}}
				data={mockSummaries}
				viewedGroupId={viewedGroupId}
			/>
		);
		const aSection = screen.getByTestId('ring-size-A');
		// ARW (15) + ABT (6) = 21
		expect(aSection.textContent).toContain('A');
		expect(aSection.textContent).toContain('21 rings');
	});

	it('renders sequence accordions within correct ring size section', () => {
		render(
			<RingSequencesPage
				params={{}}
				data={mockSummaries}
				viewedGroupId={viewedGroupId}
			/>
		);
		const aaSection = screen.getByTestId('ring-size-AA');
		expect(
			aaSection.querySelector('[data-testid="sequence-ARW-6"]')
		).toBeTruthy();

		const aSection = screen.getByTestId('ring-size-A');
		expect(
			aSection.querySelector('[data-testid="sequence-ARW-7"]')
		).toBeTruthy();
		expect(
			aSection.querySelector('[data-testid="sequence-ABT-7"]')
		).toBeTruthy();
	});

	it('omits ring size sections with no sequences', () => {
		render(
			<RingSequencesPage
				params={{}}
				data={mockSummaries}
				viewedGroupId={viewedGroupId}
			/>
		);
		expect(screen.queryByTestId('ring-size-B, C, C2')).toBeNull();
		expect(screen.queryByTestId('ring-size-D')).toBeNull();
	});

	it('shows sequence prefix, ring count, and date range in heading', () => {
		render(
			<RingSequencesPage
				params={{}}
				data={mockSummaries}
				viewedGroupId={viewedGroupId}
			/>
		);
		const arwItem = screen.getByTestId('sequence-ARW-7');
		expect(arwItem.textContent).toContain('ARW');
		expect(arwItem.textContent).toContain('15 rings');
		expect(arwItem.textContent).toContain('2022-06-15');
		expect(arwItem.textContent).toContain('2024-05-10');
	});
});
