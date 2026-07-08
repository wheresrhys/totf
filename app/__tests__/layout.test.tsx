import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { getGroupCookie } from '@/app/actions/group-cookie';
import { AuthorisedView } from '../layout';

const { mockFrom, mockOrder } = vi.hoisted(() => {
	const mockOrder = vi.fn();
	const mockSelect = vi.fn(() => ({ order: mockOrder }));
	const mockFrom = vi.fn(() => ({ select: mockSelect }));
	return { mockFrom, mockOrder };
});

vi.mock('@/lib/supabase', () => ({
	supabase: { from: mockFrom },
	catchSupabaseErrors: ({
		data,
		error
	}: {
		data: unknown;
		error: { message: string } | null;
	}) => {
		if (error) throw new Error(`Supabase error: ${error.message}`);
		return data;
	}
}));

vi.mock('@/app/actions/login', () => ({
	loginGroup: vi.fn()
}));

vi.mock('@/app/actions/logout', () => ({
	logout: vi.fn()
}));

const mockGroups = [{ id: 1, group_name: 'Alpha' }];

describe('root layout', () => {
	beforeEach(() => {
		mockOrder.mockResolvedValue({ data: mockGroups, error: null });
		vi.mocked(getGroupCookie).mockResolvedValue(1);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describe('unauthenticated (getGroupCookie returns null)', () => {
		beforeEach(() => {
			vi.mocked(getGroupCookie).mockResolvedValue(null);
		});

		it('renders LoginModal', async () => {
			render(await AuthorisedView({ children: <p>child content</p> }));
			expect(screen.getByRole('button', { name: 'Login' })).toBeDefined();
		});

		it('does not render the main nav', async () => {
			render(await AuthorisedView({ children: <p>child content</p> }));
			expect(screen.queryByRole('navigation')).toBeNull();
		});
	});

	describe('authenticated (getGroupCookie returns 1)', () => {
		it('renders children', async () => {
			render(await AuthorisedView({ children: <p>child content</p> }));
			expect(screen.getByText('child content')).toBeDefined();
		});

		it('renders the main nav', async () => {
			render(await AuthorisedView({ children: <p>child content</p> }));
			expect(screen.getByRole('navigation')).toBeDefined();
		});

		it('does not render LoginModal', async () => {
			render(await AuthorisedView({ children: <p>child content</p> }));
			expect(screen.queryByRole('button', { name: 'Login' })).toBeNull();
		});
	});
});
