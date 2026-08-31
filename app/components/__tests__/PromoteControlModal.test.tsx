import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor
} from '@testing-library/react';
import { PromoteControlModal } from '../PromoteControlModal';
import type { PromoteControlState } from '@/app/actions/ring-sequences';
import { mockRefresh } from '@/vitest.setup';

const { mockPromoteControlToSequence } = vi.hoisted(() => ({
	mockPromoteControlToSequence: vi.fn()
}));

vi.mock('@/app/actions/ring-sequences', () => ({
	promoteControlToSequence: mockPromoteControlToSequence
}));

describe('PromoteControlModal', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('names the ring and its derived prefix in the confirmation copy', () => {
		render(
			<PromoteControlModal
				ringNo="ABC1234"
				viewedGroupId={1}
				onClose={vi.fn()}
			/>
		);
		// Ring number and the leading-alpha prefix are both surfaced.
		expect(screen.getByText('ABC1234')).toBeDefined();
		expect(screen.getByText('ABC')).toBeDefined();
	});

	it('submits the ring number and viewed group id to the action and closes on success', async () => {
		const onClose = vi.fn();
		mockPromoteControlToSequence.mockImplementation(
			async (): Promise<PromoteControlState> => ({ success: true })
		);
		render(
			<PromoteControlModal
				ringNo="ABC1234"
				viewedGroupId={42}
				onClose={onClose}
			/>
		);
		fireEvent.submit(
			screen.getByRole('button', { name: 'Confirm' }).closest('form')!
		);
		await waitFor(() => {
			expect(mockRefresh).toHaveBeenCalled();
			expect(onClose).toHaveBeenCalled();
		});
		const formData = mockPromoteControlToSequence.mock.calls[0][1] as FormData;
		expect(formData.get('ring_no')).toBe('ABC1234');
		expect(formData.get('viewed_group_id')).toBe('42');
	});

	it('surfaces the action error and keeps the modal open on failure', async () => {
		const onClose = vi.fn();
		mockPromoteControlToSequence.mockImplementation(
			async (): Promise<PromoteControlState> => ({
				success: false,
				error: 'Failed to fetch data: something went wrong'
			})
		);
		render(
			<PromoteControlModal
				ringNo="ABC1234"
				viewedGroupId={1}
				onClose={onClose}
			/>
		);
		fireEvent.submit(
			screen.getByRole('button', { name: 'Confirm' }).closest('form')!
		);
		await waitFor(() => {
			expect(
				screen.getByText('Failed to fetch data: something went wrong')
			).toBeDefined();
		});
		expect(onClose).not.toHaveBeenCalled();
		expect(screen.getByTestId('promote-control-modal')).toBeDefined();
	});

	it('closes without calling the action when Cancel is clicked', () => {
		const onClose = vi.fn();
		render(
			<PromoteControlModal
				ringNo="ABC1234"
				viewedGroupId={1}
				onClose={onClose}
			/>
		);
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(onClose).toHaveBeenCalled();
		expect(mockPromoteControlToSequence).not.toHaveBeenCalled();
	});
});
