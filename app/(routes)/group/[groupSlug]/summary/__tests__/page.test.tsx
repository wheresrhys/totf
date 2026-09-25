import { describe, vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import GroupSummaryPage from '../page';
import { describeGroupScopeDelegation } from '@/app/__tests__/helpers/group-scope-delegation';

const { mockResolveGroupIdBySlug } = vi.hoisted(() => ({
	mockResolveGroupIdBySlug: vi.fn()
}));

vi.mock('@/app/lib/group-slug', () => ({
	resolveGroupIdBySlug: mockResolveGroupIdBySlug
}));

// Local override of the global next/navigation mock (vitest.setup.tsx) — this
// wrapper also needs notFound().
vi.mock('next/navigation', () => ({
	notFound: vi.fn()
}));

vi.mock('@/app/(routes)/summary/page', () => ({
	default: vi.fn(() => <div data-testid="mock-summary-page" />)
}));

import AllTimeSummaryPage from '@/app/(routes)/summary/page';

describe('GroupSummaryPage', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describeGroupScopeDelegation({
		renderGroupPage: (params) =>
			GroupSummaryPage({ params: Promise.resolve(params) }),
		mockResolveGroupIdBySlug,
		DelegatePage: AllTimeSummaryPage,
		testId: 'mock-summary-page'
	});
});
