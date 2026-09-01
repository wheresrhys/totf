import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor
} from '@testing-library/react';
import { RingSequenceEditModal } from '../RingSequenceEditModal';
import type { RingSequenceRow } from '@/app/models/db';
import type { UpdateRingSequenceState } from '@/app/actions/ring-sequences';
import { mockRefresh } from '@/vitest.setup';

const { mockUpdateRingSequence } = vi.hoisted(() => ({
	mockUpdateRingSequence: vi.fn()
}));

vi.mock('@/app/actions/ring-sequences', () => ({
	updateRingSequence: mockUpdateRingSequence
}));

const sequence: RingSequenceRow = {
	id: 5,
	prefix: 'ARW',
	size: null,
	owned_by_group: true,
	ringing_group_id: 1,
	first_ring: 'ARW00001',
	last_ring: 'ARW00099',
	first_index: 1,
	last_index: 99
};

describe('RingSequenceEditModal', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('renders a size dropdown of every ring_size value and a prefill prefix input', () => {
		render(<RingSequenceEditModal sequence={sequence} onClose={vi.fn()} />);
		const select = screen.getByRole('combobox') as HTMLSelectElement;
		// 22 enum values + the "select size" placeholder option
		expect(select.querySelectorAll('option')).toHaveLength(23);
		expect(screen.getByDisplayValue('ARW')).toBeDefined();
	});

	it('surfaces the action error message (e.g. a unique-constraint violation)', async () => {
		mockUpdateRingSequence.mockImplementation(
			async (): Promise<UpdateRingSequenceState> => ({
				success: false,
				error: 'duplicate key value violates unique constraint'
			})
		);
		render(<RingSequenceEditModal sequence={sequence} onClose={vi.fn()} />);
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save' }).closest('form')!
		);
		await waitFor(() => {
			expect(
				screen.getByText('duplicate key value violates unique constraint')
			).toBeDefined();
		});
	});

	it('shows a validation error when the action rejects an empty size', async () => {
		mockUpdateRingSequence.mockImplementation(
			async (): Promise<UpdateRingSequenceState> => ({
				success: false,
				error: 'Please select a ring size'
			})
		);
		render(<RingSequenceEditModal sequence={sequence} onClose={vi.fn()} />);
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save' }).closest('form')!
		);
		await waitFor(() => {
			expect(screen.getByText('Please select a ring size')).toBeDefined();
		});
	});

	it('refreshes the router and closes the modal on a successful update', async () => {
		const onClose = vi.fn();
		mockUpdateRingSequence.mockImplementation(
			async (): Promise<UpdateRingSequenceState> => ({ success: true })
		);
		render(<RingSequenceEditModal sequence={sequence} onClose={onClose} />);
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save' }).closest('form')!
		);
		await waitFor(() => {
			expect(mockRefresh).toHaveBeenCalled();
			expect(onClose).toHaveBeenCalled();
		});
	});

	it('closes without submitting when Cancel is clicked', () => {
		const onClose = vi.fn();
		render(<RingSequenceEditModal sequence={sequence} onClose={onClose} />);
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(onClose).toHaveBeenCalled();
		expect(mockUpdateRingSequence).not.toHaveBeenCalled();
	});
});
