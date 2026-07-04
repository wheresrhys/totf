import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor
} from '@testing-library/react';
import { LoginModal } from '../LoginModal';
import type { RingingGroupRow } from '@/app/models/db';
import type { LoginState } from '@/app/actions/login';
import { mockRefresh } from '@/vitest.setup';

const { mockLoginGroup } = vi.hoisted(() => ({
	mockLoginGroup: vi.fn()
}));

vi.mock('@/app/actions/login', () => ({
	loginGroup: mockLoginGroup
}));

const mockGroups: Pick<RingingGroupRow, 'id' | 'group_name'>[] = [
	{ id: 1, group_name: 'Alpha Group' },
	{ id: 2, group_name: 'Beta Group' }
] as RingingGroupRow[];

describe('LoginModal', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('renders group options and password field', () => {
		render(<LoginModal groups={mockGroups as RingingGroupRow[]} />);
		expect(screen.getByText('Alpha Group')).toBeDefined();
		expect(screen.getByText('Beta Group')).toBeDefined();
		expect(screen.getByPlaceholderText('Password')).toBeDefined();
	});

	it('renders login button', () => {
		render(<LoginModal groups={mockGroups as RingingGroupRow[]} />);
		expect(screen.getByRole('button', { name: 'Login' })).toBeDefined();
	});

	it('shows error message when login fails', async () => {
		mockLoginGroup.mockImplementation(
			async (_prev: LoginState, _formData: FormData): Promise<LoginState> => ({
				success: false,
				error: 'Invalid password'
			})
		);
		render(<LoginModal groups={mockGroups as RingingGroupRow[]} />);
		fireEvent.submit(
			screen.getByRole('button', { name: 'Login' }).closest('form')!
		);
		await waitFor(() => {
			expect(screen.getByText('Invalid password')).toBeDefined();
		});
	});

	it('calls router.refresh on successful login', async () => {
		mockLoginGroup.mockImplementation(
			async (_prev: LoginState, _formData: FormData): Promise<LoginState> => ({
				success: true
			})
		);
		render(<LoginModal groups={mockGroups as RingingGroupRow[]} />);
		fireEvent.submit(
			screen.getByRole('button', { name: 'Login' }).closest('form')!
		);
		await waitFor(() => {
			expect(mockRefresh).toHaveBeenCalled();
		});
	});
});
