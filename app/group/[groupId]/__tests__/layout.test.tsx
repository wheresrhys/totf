import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { redirect } from 'next/navigation';
import { getGroupCookie } from '@/app/actions/group-cookie';
import CrossGroupLayout from '../layout';

describe('cross-group layout', () => {
	beforeEach(() => {
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

		it('calls redirect("/")', async () => {
			await CrossGroupLayout({
				children: <p>child content</p>,
				params: Promise.resolve({ groupId: '1' })
			});
			expect(vi.mocked(redirect)).toHaveBeenCalledWith('/');
		});

		it('does not render children', async () => {
			vi.mocked(redirect).mockImplementationOnce(() => {
				throw new Error('NEXT_REDIRECT');
			});
			await expect(
				CrossGroupLayout({
					children: <p>child content</p>,
					params: Promise.resolve({ groupId: '1' })
				})
			).rejects.toThrow('NEXT_REDIRECT');
			expect(screen.queryByText('child content')).toBeNull();
		});
	});

	describe('authenticated', () => {
		it('renders children', async () => {
			render(
				await CrossGroupLayout({
					children: <p>child content</p>,
					params: Promise.resolve({ groupId: '1' })
				})
			);
			expect(screen.getByText('child content')).toBeDefined();
		});

		it('does not redirect', async () => {
			await CrossGroupLayout({
				children: <p>child content</p>,
				params: Promise.resolve({ groupId: '1' })
			});
			expect(vi.mocked(redirect)).not.toHaveBeenCalled();
		});
	});
});
