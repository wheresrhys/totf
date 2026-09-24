import { describe, vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import GroupSpeciesDetailPage from '../page';
import { describeGroupScopeDelegation } from '@/app/__tests__/helpers/group-scope-delegation';

const { mockResolveGroupIdBySlug } = vi.hoisted(() => ({
	mockResolveGroupIdBySlug: vi.fn()
}));

vi.mock('@/app/lib/group-slug', () => ({
	resolveGroupIdBySlug: mockResolveGroupIdBySlug
}));

// Local override of the global next/navigation mock (vitest.setup.tsx) — this
// wrapper now also needs notFound().
vi.mock('next/navigation', () => ({
	notFound: vi.fn()
}));

vi.mock('@/app/(routes)/species/[speciesName]/page', () => ({
	default: vi.fn(() => <div data-testid="mock-species-page" />)
}));

import SpeciesPage from '@/app/(routes)/species/[speciesName]/page';

describe('group species detail page', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describeGroupScopeDelegation({
		renderGroupPage: (params) =>
			GroupSpeciesDetailPage({ params: Promise.resolve(params) }),
		mockResolveGroupIdBySlug,
		DelegatePage: SpeciesPage,
		testId: 'mock-species-page',
		extraParams: { speciesName: 'Robin' }
	});
});
