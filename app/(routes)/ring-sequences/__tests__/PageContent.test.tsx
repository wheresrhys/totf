import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	waitFor,
	within,
	fireEvent
} from '@testing-library/react';
import { RingSequencesPageContent } from '../PageContent';
import type { RingSequenceRow } from '@/app/models/db';
import type { RingSequenceBirdRow } from '@/app/actions/ring-sequences';
import type { UnassignedImportPrefix } from '@/app/models/ring-sequences';

vi.mock('@/app/actions/ring-sequences', () => ({
	fetchRingSequences: vi.fn(),
	fetchRingSequenceBirds: vi.fn(),
	fetchUnassignedImportPrefixes: vi.fn(),
	updateRingSequence: vi.fn(),
	createSequenceFromImportPrefix: vi.fn()
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

const viewedGroup = { id: 42, slug: null };

function renderPage(
	sequences: RingSequenceRow[],
	unassignedPrefixes: UnassignedImportPrefix[] = []
) {
	return render(
		<RingSequencesPageContent
			data={{ sequences, unassignedPrefixes }}
			viewedGroup={viewedGroup}
		/>
	);
}

describe('RingSequencesPageContent (RingSequences table data path)', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('renders one row per RingSequences entry grouped by size', () => {
		renderPage(mockSequences);
		expect(screen.getByTestId('sequence-1')).toBeDefined();
		expect(screen.getByTestId('sequence-2')).toBeDefined();
		expect(screen.getByTestId('sequence-3')).toBeDefined();
		expect(screen.getByTestId('sequence-4')).toBeDefined();
	});

	it('groups sizes in RING_SIZE_ENUM_ORDER with the missing-size group first', () => {
		renderPage(mockSequences);
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
		renderPage(mockSequences);
		const aSection = screen.getByTestId('ring-size-A');
		expect(within(aSection).getByTestId('sequence-1')).toBeDefined();
		expect(within(aSection).getByTestId('sequence-2')).toBeDefined();
		expect(within(aSection).queryByTestId('missing-size-badge')).toBeNull();
	});

	it('renders null-size rows in the missing-size group with a warning badge', () => {
		renderPage(mockSequences);
		const missingSection = screen.getByTestId('ring-size-missing');
		expect(
			within(missingSection).getByTestId('missing-size-badge')
		).toBeDefined();
		expect(within(missingSection).getByTestId('sequence-4')).toBeDefined();
	});

	it('shows prefix and first_ring–last_ring range in the row heading', () => {
		renderPage(mockSequences);
		const row = screen.getByTestId('sequence-1');
		expect(row.textContent).toContain('ARW');
		expect(row.textContent).toContain('ARW00001');
		expect(row.textContent).toContain('ARW00099');
	});

	it('renders an empty state without throwing when there are no sequences', () => {
		renderPage([]);
		expect(screen.getByTestId('ring-sequences-empty')).toBeDefined();
		expect(screen.queryByTestId(/^ring-size-/)).toBeNull();
	});

	it('opens the edit modal for a row without toggling its detail', () => {
		renderPage(mockSequences);
		expect(screen.queryByTestId('ring-sequence-edit-modal')).toBeNull();

		fireEvent.click(screen.getByTestId('edit-sequence-1'));

		expect(screen.getByTestId('ring-sequence-edit-modal')).toBeDefined();
		// The accordion detail should not have expanded (no fetch triggered).
		expect(
			within(screen.getByTestId('ring-sequence-edit-modal')).getByText('ARW')
		).toBeDefined();
	});

	it('fetches and renders a row detail when expanded', async () => {
		const { fetchRingSequenceBirds } =
			await import('@/app/actions/ring-sequences');
		const detailRows: RingSequenceBirdRow[] = [
			{ ring_no: 'ARW00001', species_name: 'Robin', ringed_date: '2022-06-15' }
		];
		vi.mocked(fetchRingSequenceBirds).mockResolvedValue(detailRows);

		renderPage(mockSequences);
		const row = screen.getByTestId('sequence-1');
		const toggle = within(row).getAllByRole('button')[0];
		fireEvent.click(toggle);

		await waitFor(() => {
			expect(vi.mocked(fetchRingSequenceBirds)).toHaveBeenCalledWith(1);
			expect(screen.getByText(/Robin/)).toBeDefined();
		});
	});
});

describe('RingSequencesPageContent — unassigned import prefixes', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	const unassignedPrefixes: UnassignedImportPrefix[] = [
		{ prefix: 'AEL', ring_nos: ['AEL1699', 'AEL1700', 'AEL1701'] },
		{ prefix: 'DB1', ring_nos: ['DB12345'] }
	];

	it('renders a button per unassigned prefix showing its ring count', () => {
		renderPage(mockSequences, unassignedPrefixes);
		const section = screen.getByTestId('unassigned-prefixes');
		expect(within(section).getByTestId('unassigned-prefix-AEL')).toBeDefined();
		const aelButton = within(section).getByTestId('unassigned-prefix-AEL');
		expect(aelButton.textContent).toContain('AEL');
		expect(aelButton.textContent).toContain('(3)');
		expect(within(section).getByTestId('unassigned-prefix-DB1')).toBeDefined();
	});

	it('does not render the unassigned-prefixes section when there are none', () => {
		renderPage(mockSequences, []);
		expect(screen.queryByTestId('unassigned-prefixes')).toBeNull();
	});

	it('still shows the empty sequences state alongside unassigned prefixes', () => {
		renderPage([], unassignedPrefixes);
		expect(screen.getByTestId('unassigned-prefixes')).toBeDefined();
		expect(screen.getByTestId('ring-sequences-empty')).toBeDefined();
	});

	it('opens the create-sequence modal with the prefix rings and suggested bounds', () => {
		renderPage(mockSequences, unassignedPrefixes);
		expect(
			screen.queryByTestId('create-sequence-from-prefix-modal')
		).toBeNull();

		fireEvent.click(screen.getByTestId('unassigned-prefix-AEL'));

		const modal = screen.getByTestId('create-sequence-from-prefix-modal');
		expect(modal).toBeDefined();
		// Lists every ring number sharing the prefix.
		const ringList = within(modal).getByTestId('prefix-ring-list');
		expect(ringList.textContent).toContain('AEL1699');
		expect(ringList.textContent).toContain('AEL1701');
		// Pre-fills first/last ring from deriveRingBounds (real, not mocked):
		// decade start 1691 for 1699, last rounded up to 1710.
		expect(screen.getByDisplayValue('AEL1691')).toBeDefined();
		expect(screen.getByDisplayValue('AEL1710')).toBeDefined();
	});

	it('closes the create-sequence modal on Cancel without creating', async () => {
		const { createSequenceFromImportPrefix } =
			await import('@/app/actions/ring-sequences');
		renderPage(mockSequences, unassignedPrefixes);
		fireEvent.click(screen.getByTestId('unassigned-prefix-DB1'));
		expect(
			screen.getByTestId('create-sequence-from-prefix-modal')
		).toBeDefined();

		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(
			screen.queryByTestId('create-sequence-from-prefix-modal')
		).toBeNull();
		expect(vi.mocked(createSequenceFromImportPrefix)).not.toHaveBeenCalled();
	});
});
