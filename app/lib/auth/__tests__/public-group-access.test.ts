import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolvePublicPageViewedGroupId } from '../public-group-access';

const { mockResolveGroupIdBySlug, mockResolveGroupPublicAreasForRequest } =
	vi.hoisted(() => ({
		mockResolveGroupIdBySlug: vi.fn(),
		mockResolveGroupPublicAreasForRequest: vi.fn()
	}));

vi.mock('../../group-slug', () => ({
	resolveGroupIdBySlug: mockResolveGroupIdBySlug,
	resolveGroupPublicAreasForRequest: mockResolveGroupPublicAreasForRequest
}));

describe('resolvePublicPageViewedGroupId', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('a summary-subtree path to a public group', () => {
		it('returns the viewed group id for the base summary path', async () => {
			mockResolveGroupIdBySlug.mockResolvedValue(2);
			mockResolveGroupPublicAreasForRequest.mockResolvedValue(['summary']);

			expect(await resolvePublicPageViewedGroupId('/group/alpha/summary')).toBe(
				2
			);
		});

		it('returns the viewed group id for a year-scoped summary path', async () => {
			mockResolveGroupIdBySlug.mockResolvedValue(2);
			mockResolveGroupPublicAreasForRequest.mockResolvedValue(['summary']);

			expect(
				await resolvePublicPageViewedGroupId('/group/alpha/summary/2026')
			).toBe(2);
		});

		it('returns the viewed group id for a year/month-scoped summary path', async () => {
			mockResolveGroupIdBySlug.mockResolvedValue(2);
			mockResolveGroupPublicAreasForRequest.mockResolvedValue(['summary']);

			expect(
				await resolvePublicPageViewedGroupId('/group/alpha/summary/2026/3')
			).toBe(2);
		});
	});

	it('returns null for a summary-subtree path to a non-public group', async () => {
		mockResolveGroupIdBySlug.mockResolvedValue(2);
		mockResolveGroupPublicAreasForRequest.mockResolvedValue([]);

		expect(
			await resolvePublicPageViewedGroupId('/group/alpha/summary')
		).toBeNull();
	});

	it('returns null for a non-summary path, even to a public group', async () => {
		expect(
			await resolvePublicPageViewedGroupId('/group/alpha/effort')
		).toBeNull();
		expect(mockResolveGroupIdBySlug).not.toHaveBeenCalled();
	});

	it('returns null for an unknown groupSlug, without throwing', async () => {
		mockResolveGroupIdBySlug.mockResolvedValue(null);

		expect(
			await resolvePublicPageViewedGroupId('/group/no-such-group/summary')
		).toBeNull();
		expect(mockResolveGroupPublicAreasForRequest).not.toHaveBeenCalled();
	});

	it('returns null for a null pathname', async () => {
		expect(await resolvePublicPageViewedGroupId(null)).toBeNull();
		expect(mockResolveGroupIdBySlug).not.toHaveBeenCalled();
	});
});
