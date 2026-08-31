import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	within
} from '@testing-library/react';
import { ControlsPage } from '../ControlsPage';
import type { RingSequenceControlRow } from '@/app/actions/ring-sequences';

// ControlsPage renders PromoteControlModal, which imports the server action;
// mock it so importing the tree doesn't pull the real action.
vi.mock('@/app/actions/ring-sequences', () => ({
	promoteControlToSequence: vi.fn()
}));

const rows: RingSequenceControlRow[] = [
	{ ring_no: 'ABC1234', species_name: 'Robin', first_date: '2023-06-01' },
	{ ring_no: 'XYZ9999', species_name: 'Wren', first_date: '2024-01-15' }
];

const viewedGroup = { id: 1, slug: 'alpha' };

describe('ControlsPage promote flow', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders a promote button for every control row', () => {
		render(<ControlsPage params={{}} data={rows} viewedGroup={viewedGroup} />);
		expect(screen.getByTestId('promote-control-ABC1234')).toBeDefined();
		expect(screen.getByTestId('promote-control-XYZ9999')).toBeDefined();
	});

	it('does not show the modal until a promote button is clicked', () => {
		render(<ControlsPage params={{}} data={rows} viewedGroup={viewedGroup} />);
		expect(screen.queryByTestId('promote-control-modal')).toBeNull();
	});

	it('opens the confirmation modal naming the clicked row on promote', () => {
		render(<ControlsPage params={{}} data={rows} viewedGroup={viewedGroup} />);
		fireEvent.click(screen.getByTestId('promote-control-XYZ9999'));
		const modal = screen.getByTestId('promote-control-modal');
		expect(modal).toBeDefined();
		// The modal names the clicked ring and its prefix.
		expect(within(modal).getByText('XYZ9999')).toBeDefined();
		expect(within(modal).getByText('XYZ')).toBeDefined();
	});
});
