import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor
} from '@testing-library/react';
import { CreateSequenceForRing } from '../CreateSequenceForRing';
import type { PromoteControlState } from '@/app/actions/ring-sequences';
import { mockRefresh } from '@/vitest.setup';

const { mockPromoteControlToSequence } = vi.hoisted(() => ({
	mockPromoteControlToSequence: vi.fn()
}));

vi.mock('@/app/actions/ring-sequences', () => ({
	promoteControlToSequence: mockPromoteControlToSequence
}));

function renderCreateSequenceForRing(
	overrides: Partial<{
		ringNo: string;
		viewedGroupId: number;
		onClose: () => void;
	}> = {}
) {
	const onClose = overrides.onClose ?? vi.fn();
	const props = { ringNo: 'ABC1234', viewedGroupId: 1, ...overrides, onClose };
	const renderResult = render(
		<CreateSequenceForRing
			ringNo={props.ringNo}
			viewedGroupId={props.viewedGroupId}
			onClose={onClose}
		/>
	);
	return { ...renderResult, onClose };
}

describe('CreateSequenceForRing', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('names the ring and its derived prefix in the confirmation copy', () => {
		renderCreateSequenceForRing();
		// Ring number and its first-3-characters prefix are both surfaced.
		expect(screen.getByText('ABC1234')).toBeDefined();
		expect(screen.getByText('ABC')).toBeDefined();
	});

	it('submits the ring number and viewed group id to the action and closes on success', async () => {
		mockPromoteControlToSequence.mockImplementation(
			async (): Promise<PromoteControlState> => ({ success: true })
		);
		const { onClose } = renderCreateSequenceForRing({ viewedGroupId: 42 });
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
		mockPromoteControlToSequence.mockImplementation(
			async (): Promise<PromoteControlState> => ({
				success: false,
				error: 'Failed to fetch data: something went wrong'
			})
		);
		const { onClose } = renderCreateSequenceForRing();
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
		const { onClose } = renderCreateSequenceForRing();
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(onClose).toHaveBeenCalled();
		expect(mockPromoteControlToSequence).not.toHaveBeenCalled();
	});
});
