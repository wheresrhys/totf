import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { TabContent } from '../TabContent';
import type { ViewedGroup } from '@/app/lib/group-slug';

const viewedGroup: ViewedGroup = { id: 1, slug: 'alpha' };

function TestTabComponent({
	data
}: {
	params: { foo: string };
	data: string | null;
	viewedGroup: ViewedGroup;
}) {
	return <p data-testid="tab-component">{data ?? 'no data'}</p>;
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('TabContent', () => {
	describe('no dataFetcher', () => {
		it('renders TabComponent immediately with data: null', () => {
			render(
				<TabContent
					TabComponent={TestTabComponent}
					params={{ foo: 'bar' }}
					viewedGroup={viewedGroup}
				/>
			);
			expect(screen.getByTestId('tab-component').textContent).toBe('no data');
		});
	});

	describe('dataFetcher with matching initialData', () => {
		it('renders TabComponent immediately with the initial data', () => {
			const dataFetcher = vi.fn().mockResolvedValue('fetched');
			render(
				<TabContent
					dataFetcher={dataFetcher}
					TabComponent={TestTabComponent}
					params={{ foo: 'bar' }}
					viewedGroup={viewedGroup}
					initialData="prefetched"
				/>
			);
			expect(screen.getByTestId('tab-component').textContent).toBe(
				'prefetched'
			);
		});

		it('never calls dataFetcher', async () => {
			const dataFetcher = vi.fn().mockResolvedValue('fetched');
			render(
				<TabContent
					dataFetcher={dataFetcher}
					TabComponent={TestTabComponent}
					params={{ foo: 'bar' }}
					viewedGroup={viewedGroup}
					initialData="prefetched"
				/>
			);
			// give any erroneous fetch a chance to fire
			await Promise.resolve();
			expect(dataFetcher).not.toHaveBeenCalled();
		});
	});

	describe('dataFetcher with no initialData, success', () => {
		it('shows a loading state before the fetch resolves', () => {
			const dataFetcher = vi.fn(() => new Promise<string>(() => {}));
			render(
				<TabContent
					dataFetcher={dataFetcher}
					TabComponent={TestTabComponent}
					params={{ foo: 'bar' }}
					viewedGroup={viewedGroup}
					loadingMessage="Loading tab…"
				/>
			);
			expect(screen.queryByTestId('tab-component')).toBeNull();
			expect(screen.getByText('Loading tab…')).not.toBeNull();
		});

		it('renders TabComponent with the resolved data once the fetch completes', async () => {
			const dataFetcher = vi.fn().mockResolvedValue('resolved');
			render(
				<TabContent
					dataFetcher={dataFetcher}
					TabComponent={TestTabComponent}
					params={{ foo: 'bar' }}
					viewedGroup={viewedGroup}
				/>
			);
			await waitFor(() =>
				expect(screen.getByTestId('tab-component').textContent).toBe('resolved')
			);
		});

		it('does not refetch on an unrelated re-render', async () => {
			const dataFetcher = vi.fn().mockResolvedValue('resolved');
			const { rerender } = render(
				<TabContent
					dataFetcher={dataFetcher}
					TabComponent={TestTabComponent}
					params={{ foo: 'bar' }}
					viewedGroup={viewedGroup}
				/>
			);
			await waitFor(() => expect(dataFetcher).toHaveBeenCalledTimes(1));
			rerender(
				<TabContent
					dataFetcher={dataFetcher}
					TabComponent={TestTabComponent}
					params={{ foo: 'bar' }}
					viewedGroup={viewedGroup}
				/>
			);
			await Promise.resolve();
			expect(dataFetcher).toHaveBeenCalledTimes(1);
		});
	});

	describe('dataFetcher with no initialData, failure', () => {
		it('shows a visible error state instead of hanging in loading', async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			const failure = new Error('boom');
			const dataFetcher = vi.fn().mockRejectedValue(failure);
			render(
				<TabContent
					dataFetcher={dataFetcher}
					TabComponent={TestTabComponent}
					params={{ foo: 'bar' }}
					viewedGroup={viewedGroup}
				/>
			);
			await waitFor(() => expect(screen.getByRole('alert')).not.toBeNull());
			expect(screen.queryByTestId('tab-component')).toBeNull();
		});

		it('does not retry automatically', async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			const failure = new Error('boom');
			const dataFetcher = vi.fn().mockRejectedValue(failure);
			render(
				<TabContent
					dataFetcher={dataFetcher}
					TabComponent={TestTabComponent}
					params={{ foo: 'bar' }}
					viewedGroup={viewedGroup}
				/>
			);
			await waitFor(() => expect(dataFetcher).toHaveBeenCalledTimes(1));
			await Promise.resolve();
			expect(dataFetcher).toHaveBeenCalledTimes(1);
		});
	});
});
