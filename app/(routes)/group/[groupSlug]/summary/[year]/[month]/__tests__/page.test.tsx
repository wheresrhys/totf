import { describe, vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import GroupSummaryYearMonthPage from '../page';
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

vi.mock('@/app/(routes)/summary/[year]/[month]/page', () => ({
	default: vi.fn(() => <div data-testid="mock-year-month-summary-page" />)
}));

import YearMonthSummaryPage from '@/app/(routes)/summary/[year]/[month]/page';

describe('GroupSummaryYearMonthPage', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describeGroupScopeDelegation({
		renderGroupPage: (params) =>
			GroupSummaryYearMonthPage({ params: Promise.resolve(params) }),
		mockResolveGroupIdBySlug,
		DelegatePage: YearMonthSummaryPage,
		testId: 'mock-year-month-summary-page',
		extraParams: { year: '2025', month: '3' }
	});
});
