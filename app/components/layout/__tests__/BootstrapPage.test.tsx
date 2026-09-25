import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { LoadWithData, type DefaultPageParams } from '../BootstrapPage';

vi.unmock('@/app/components/layout/BootstrapPage');

vi.mock('next/server', () => ({
	connection: vi.fn().mockResolvedValue(undefined)
}));

const { mockGetGroupCookie } = vi.hoisted(() => ({
	mockGetGroupCookie: vi.fn()
}));

vi.mock('@/app/actions/group-cookie', () => ({
	getGroupCookie: mockGetGroupCookie
}));

const { mockResolveGroupSlugById } = vi.hoisted(() => ({
	mockResolveGroupSlugById: vi.fn()
}));

vi.mock('@/app/lib/group-slug', () => ({
	resolveGroupSlugById: mockResolveGroupSlugById
}));

type TestData = { ok: boolean };

function TestPageComponent({
	viewedGroup
}: {
	params: DefaultPageParams;
	data: TestData;
	viewedGroup: { id: number; slug: string | null };
}) {
	return <div data-testid="page-content">{viewedGroup.id}</div>;
}

async function renderLoadWithData(
	overrides: Partial<{
		viewedGroup: { id: number; slug: string | null };
		getCacheKeys: () => string[];
		dataFetcher: (
			params: DefaultPageParams,
			viewedGroupId: number
		) => Promise<TestData>;
		PageComponent: typeof TestPageComponent;
	}> = {}
) {
	const props = {
		getCacheKeys: () => ['key'],
		dataFetcher: vi.fn().mockResolvedValue({ ok: true } as TestData),
		PageComponent: TestPageComponent,
		...overrides
	};
	const element = await LoadWithData<TestData, undefined, DefaultPageParams>(
		props
	);
	return { ...render(element), dataFetcher: props.dataFetcher };
}

describe('LoadWithData', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('uses an explicitly passed viewedGroup as-is, without triggering cookie-based resolution', async () => {
		mockGetGroupCookie.mockResolvedValue(1);

		const { dataFetcher } = await renderLoadWithData({
			viewedGroup: { id: 42, slug: 'explicit-slug' }
		});

		expect((await screen.findByTestId('page-content')).textContent).toBe('42');
		expect(dataFetcher).toHaveBeenCalledWith({}, 42);
		expect(mockResolveGroupSlugById).not.toHaveBeenCalled();
	});

	it('derives viewedGroup from the logged-in group cookie when omitted', async () => {
		mockGetGroupCookie.mockResolvedValue(7);
		mockResolveGroupSlugById.mockResolvedValue('cookie-slug');

		const { dataFetcher } = await renderLoadWithData();

		expect((await screen.findByTestId('page-content')).textContent).toBe('7');
		expect(mockResolveGroupSlugById).toHaveBeenCalledWith(7);
		expect(dataFetcher).toHaveBeenCalledWith({}, 7);
	});

	it('renders the "select a group" fallback when there is no viewedGroup and no logged-in group', async () => {
		mockGetGroupCookie.mockResolvedValue(null);

		const { dataFetcher } = await renderLoadWithData({ dataFetcher: vi.fn() });

		expect(
			await screen.findByText('Select a group to view data on this site')
		).not.toBeNull();
		expect(dataFetcher).not.toHaveBeenCalled();
	});

	it('does not crash when the derived slug resolves to null', async () => {
		mockGetGroupCookie.mockResolvedValue(9);
		mockResolveGroupSlugById.mockResolvedValue(null);

		await renderLoadWithData();

		expect((await screen.findByTestId('page-content')).textContent).toBe('9');
		expect(mockResolveGroupSlugById).toHaveBeenCalledWith(9);
	});
});
