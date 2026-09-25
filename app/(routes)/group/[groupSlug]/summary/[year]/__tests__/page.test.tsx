import { describe, vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import GroupSummaryYearPage from '../page';
import { describeGroupScopeDelegation } from '@/app/__tests__/helpers/group-scope-delegation';

const { mockResolveGroupIdBySlug } = vi.hoisted(() => ({
	mockResolveGroupIdBySlug: vi.fn()
}));

vi.mock('@/app/lib/group-slug', () => ({
	resolveGroupIdBySlug: mockResolveGroupIdBySlug
}));

vi.mock('next/navigation', () => ({
	notFound: vi.fn()
}));

vi.mock('@/app/(routes)/summary/[year]/page', () => ({
	default: vi.fn(() => <div data-testid="mock-year-summary-page" />)
}));

import YearSummaryPage from '@/app/(routes)/summary/[year]/page';

describe('GroupSummaryYearPage', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describeGroupScopeDelegation({
		renderGroupPage: (params) =>
			GroupSummaryYearPage({ params: Promise.resolve(params) }),
		mockResolveGroupIdBySlug,
		DelegatePage: YearSummaryPage,
		testId: 'mock-year-summary-page',
		extraParams: { year: '2025' }
	});
});
