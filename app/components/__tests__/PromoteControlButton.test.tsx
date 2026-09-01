import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { PromoteControlButton } from '../PromoteControlButton';

// PromoteControlButton renders CreateSequenceForRing, which imports the
// server action; mock it so importing the tree doesn't pull the real action.
vi.mock('@/app/actions/ring-sequences', () => ({
	promoteControlToSequence: vi.fn()
}));

describe('PromoteControlButton', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders a promote button for the given ring', () => {
		render(<PromoteControlButton ringNo="ABC1234" viewedGroupId={1} />);
		expect(screen.getByTestId('promote-control-ABC1234')).toBeDefined();
	});

	it('does not show the modal until the promote button is clicked', () => {
		render(<PromoteControlButton ringNo="ABC1234" viewedGroupId={1} />);
		expect(screen.queryByTestId('promote-control-modal')).toBeNull();
	});

	it('opens the confirmation modal naming the ring and its prefix on click', () => {
		render(<PromoteControlButton ringNo="XYZ9999" viewedGroupId={1} />);
		fireEvent.click(screen.getByTestId('promote-control-XYZ9999'));
		const modal = screen.getByTestId('promote-control-modal');
		expect(modal).toBeDefined();
		expect(within(modal).getByText('XYZ9999')).toBeDefined();
		expect(within(modal).getByText('XYZ')).toBeDefined();
	});

	it('closes the modal when Cancel is clicked', () => {
		render(<PromoteControlButton ringNo="XYZ9999" viewedGroupId={1} />);
		fireEvent.click(screen.getByTestId('promote-control-XYZ9999'));
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByTestId('promote-control-modal')).toBeNull();
	});
});
