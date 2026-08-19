import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { LoadWithData, type DefaultPageParams } from '../BootstrapPageData';

vi.unmock('@/app/components/layout/BootstrapPageData');

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

vi.mock('@/lib/group-slug', () => ({
	resolveGroupSlugById: mockResolveGroupSlugById
}));

type TestData = { ok: boolean };

function TestPageComponent({
	viewedGroupId
}: {
	params: DefaultPageParams;
	data: TestData;
	viewedGroupId: number;
}) {
	return <div data-testid="page-content">{viewedGroupId}</div>;
}

describe('LoadWithData', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('uses an explicitly passed viewedGroup as-is, without triggering cookie-based resolution', async () => {
		mockGetGroupCookie.mockResolvedValue(1);
		const dataFetcher = vi.fn().mockResolvedValue({ ok: true } as TestData);

		const element = await LoadWithData<TestData, undefined, DefaultPageParams>({
			viewedGroup: { id: 42, slug: 'explicit-slug' },
			getCacheKeys: () => ['key'],
			dataFetcher,
			PageComponent: TestPageComponent
		});
		render(element);

		expect((await screen.findByTestId('page-content')).textContent).toBe('42');
		expect(dataFetcher).toHaveBeenCalledWith({}, 42);
		expect(mockResolveGroupSlugById).not.toHaveBeenCalled();
	});

	it('derives viewedGroup from the logged-in group cookie when omitted', async () => {
		mockGetGroupCookie.mockResolvedValue(7);
		mockResolveGroupSlugById.mockResolvedValue('cookie-slug');
		const dataFetcher = vi.fn().mockResolvedValue({ ok: true } as TestData);

		const element = await LoadWithData<TestData, undefined, DefaultPageParams>({
			getCacheKeys: () => ['key'],
			dataFetcher,
			PageComponent: TestPageComponent
		});
		render(element);

		expect((await screen.findByTestId('page-content')).textContent).toBe('7');
		expect(mockResolveGroupSlugById).toHaveBeenCalledWith(7);
		expect(dataFetcher).toHaveBeenCalledWith({}, 7);
	});

	it('renders the "select a group" fallback when there is no viewedGroup and no logged-in group', async () => {
		mockGetGroupCookie.mockResolvedValue(null);
		const dataFetcher = vi.fn();

		const element = await LoadWithData<TestData, undefined, DefaultPageParams>({
			getCacheKeys: () => ['key'],
			dataFetcher,
			PageComponent: TestPageComponent
		});
		render(element);

		expect(
			await screen.findByText('Select a group to view data on this site')
		).not.toBeNull();
		expect(dataFetcher).not.toHaveBeenCalled();
	});

	it('does not crash when the derived slug resolves to null', async () => {
		mockGetGroupCookie.mockResolvedValue(9);
		mockResolveGroupSlugById.mockResolvedValue(null);
		const dataFetcher = vi.fn().mockResolvedValue({ ok: true } as TestData);

		const element = await LoadWithData<TestData, undefined, DefaultPageParams>({
			getCacheKeys: () => ['key'],
			dataFetcher,
			PageComponent: TestPageComponent
		});
		render(element);

		expect((await screen.findByTestId('page-content')).textContent).toBe('9');
		expect(mockResolveGroupSlugById).toHaveBeenCalledWith(9);
	});
});
