import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	waitFor,
	within,
	fireEvent
} from '@testing-library/react';
import { RingSequencesPage } from '../RingSequencesPage';
import type { RingSequenceRow } from '@/app/models/db';
import type { RingSequenceBirdRow } from '@/app/actions/ring-sequences';

vi.mock('@/app/actions/ring-sequences', () => ({
	fetchRingSequences: vi.fn(),
	fetchRingSequenceBirds: vi.fn(),
	updateRingSequence: vi.fn()
}));

function makeSequence(
	overrides: Partial<RingSequenceRow> & Pick<RingSequenceRow, 'id' | 'prefix'>
): RingSequenceRow {
	return {
		size: null,
		owned_by_group: true,
		ringing_group_id: 1,
		first_ring: `${overrides.prefix}00001`,
		last_ring: `${overrides.prefix}00099`,
		first_index: 1,
		last_index: 99,
		...overrides
	};
}

const mockSequences: RingSequenceRow[] = [
	makeSequence({ id: 1, prefix: 'ARW', size: 'A' }),
	makeSequence({ id: 2, prefix: 'ABT', size: 'A' }),
	makeSequence({ id: 3, prefix: 'CJ', size: 'C' }),
	makeSequence({ id: 4, prefix: 'ZZZ', size: null })
];

describe('RingSequencesPage (RingSequences table data path)', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('renders one row per RingSequences entry grouped by size', () => {
		render(<RingSequencesPage data={mockSequences} />);
		expect(screen.getByTestId('sequence-1')).toBeDefined();
		expect(screen.getByTestId('sequence-2')).toBeDefined();
		expect(screen.getByTestId('sequence-3')).toBeDefined();
		expect(screen.getByTestId('sequence-4')).toBeDefined();
	});

	it('groups sizes in RING_SIZE_ENUM_ORDER with the missing-size group first', () => {
		render(<RingSequencesPage data={mockSequences} />);
		const sections = screen
			.getAllByTestId(/^ring-size-/)
			.map((el) => el.getAttribute('data-testid'));
		expect(sections).toEqual([
			'ring-size-missing',
			'ring-size-A',
			'ring-size-C'
		]);
	});

	it('places a sized row in its size group with no highlight badge', () => {
		render(<RingSequencesPage data={mockSequences} />);
		const aSection = screen.getByTestId('ring-size-A');
		expect(within(aSection).getByTestId('sequence-1')).toBeDefined();
		expect(within(aSection).getByTestId('sequence-2')).toBeDefined();
		expect(within(aSection).queryByTestId('missing-size-badge')).toBeNull();
	});

	it('renders null-size rows in the missing-size group with a warning badge', () => {
		render(<RingSequencesPage data={mockSequences} />);
		const missingSection = screen.getByTestId('ring-size-missing');
		expect(
			within(missingSection).getByTestId('missing-size-badge')
		).toBeDefined();
		expect(within(missingSection).getByTestId('sequence-4')).toBeDefined();
	});

	it('shows prefix and first_ring–last_ring range in the row heading', () => {
		render(<RingSequencesPage data={mockSequences} />);
		const row = screen.getByTestId('sequence-1');
		expect(row.textContent).toContain('ARW');
		expect(row.textContent).toContain('ARW00001');
		expect(row.textContent).toContain('ARW00099');
	});

	it('renders an empty state without throwing when there are no sequences', () => {
		render(<RingSequencesPage data={[]} />);
		expect(screen.getByTestId('ring-sequences-empty')).toBeDefined();
		expect(screen.queryByTestId(/^ring-size-/)).toBeNull();
	});

	it('opens the edit modal for a row without toggling its detail', () => {
		render(<RingSequencesPage data={mockSequences} />);
		expect(screen.queryByTestId('ring-sequence-edit-modal')).toBeNull();

		fireEvent.click(screen.getByTestId('edit-sequence-1'));

		expect(screen.getByTestId('ring-sequence-edit-modal')).toBeDefined();
		// The accordion detail should not have expanded (no fetch triggered).
		expect(screen.getByDisplayValue('ARW')).toBeDefined();
	});

	it('fetches and renders a row detail when expanded', async () => {
		const { fetchRingSequenceBirds } =
			await import('@/app/actions/ring-sequences');
		const detailRows: RingSequenceBirdRow[] = [
			{ ring_no: 'ARW00001', species_name: 'Robin', ringed_date: '2022-06-15' }
		];
		vi.mocked(fetchRingSequenceBirds).mockResolvedValue(detailRows);

		render(<RingSequencesPage data={mockSequences} />);
		const row = screen.getByTestId('sequence-1');
		const toggle = within(row).getAllByRole('button')[0];
		fireEvent.click(toggle);

		await waitFor(() => {
			expect(vi.mocked(fetchRingSequenceBirds)).toHaveBeenCalledWith(1);
			expect(screen.getByText(/Robin/)).toBeDefined();
		});
	});
});
