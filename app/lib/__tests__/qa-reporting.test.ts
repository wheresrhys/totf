import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockCookieStore } = vi.hoisted(() => {
	const mockCookieStore = { get: vi.fn() };
	return { mockCookieStore };
});

vi.mock('next/headers', () => ({
	cookies: vi.fn().mockResolvedValue(mockCookieStore)
}));

import { canReportHighlights } from '../qa-reporting';

describe('canReportHighlights', () => {
	const originalVercelEnv = process.env.VERCEL_ENV;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		process.env.VERCEL_ENV = originalVercelEnv;
	});

	it('returns false when not running in production', async () => {
		process.env.VERCEL_ENV = 'preview';
		mockCookieStore.get.mockReturnValue({ value: 'true' });

		expect(await canReportHighlights()).toBe(false);
	});

	it('returns false in production when the qa cookie is missing', async () => {
		process.env.VERCEL_ENV = 'production';
		mockCookieStore.get.mockReturnValue(undefined);

		expect(await canReportHighlights()).toBe(false);
	});

	it('returns false in production when the qa cookie is not "true"', async () => {
		process.env.VERCEL_ENV = 'production';
		mockCookieStore.get.mockReturnValue({ value: 'false' });

		expect(await canReportHighlights()).toBe(false);
	});

	it('returns true in production when the qa cookie is "true"', async () => {
		process.env.VERCEL_ENV = 'production';
		mockCookieStore.get.mockReturnValue({ value: 'true' });

		expect(await canReportHighlights()).toBe(true);
	});
});
