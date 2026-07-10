import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchSessionHighlights } from '../session-highlights';
import type { TopMetricsFilterParams } from '@/app/models/db';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const SESSION_DATE = '2024-09-15';
const GROUP_ID = 1;

describe('fetchSessionHighlights', () => {
	const mockRpc = vi.fn();

	beforeEach(() => {
		mockRpc.mockReset();
		mockRpc.mockResolvedValue({ data: [], error: null });
		mockGetAuthenticatedSupabaseClient.mockResolvedValue({ rpc: mockRpc });
	});

	it('calls top_metrics_by_period once per metric and scope with ringing_group_filter set', async () => {
		await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		expect(mockRpc).toHaveBeenCalledTimes(8);
		const calls = mockRpc.mock.calls as [
			string,
			{
				temporal_unit: string;
				metric_name: string;
				result_limit: number;
				filters: TopMetricsFilterParams;
			}
		][];
		calls.forEach(([functionName, args]) => {
			expect(functionName).toBe('top_metrics_by_period');
			expect(args.temporal_unit).toBe('day');
			expect(args.result_limit).toBe(2);
			expect(args.filters.ringing_group_filter).toBe(GROUP_ID);
		});
		const metricNames = calls.map(([, args]) => args.metric_name);
		expect(metricNames.filter((name) => name === 'encounters').length).toBe(4);
		expect(metricNames.filter((name) => name === 'species').length).toBe(4);
	});

	it('maps matching top results into session-total-record highlights', async () => {
		mockRpc.mockImplementation(
			(
				_functionName: string,
				args: { metric_name: string; filters: TopMetricsFilterParams }
			) => {
				const isAllTimeEncounters =
					args.metric_name === 'encounters' &&
					args.filters.months_filter === undefined &&
					args.filters.year_filter === undefined &&
					args.filters.exact_months_filter === undefined;
				return Promise.resolve({
					data: isAllTimeEncounters
						? [
								{ visit_date: SESSION_DATE, metric_value: 74 },
								{ visit_date: '2022-05-01', metric_value: 60 }
							]
						: [],
					error: null
				});
			}
		);
		const highlights = await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		expect(highlights).toEqual([
			expect.objectContaining({
				type: 'session-total-record',
				metric: 'encounters',
				scope: 'all-time',
				value: 74
			})
		]);
	});
});
