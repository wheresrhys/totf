import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { dispatchStatsCacheRefreshEvents } from '../dispatch-stats-cache-events';
import { buildStatsCacheRefreshEvents } from '../stats-cache-events';
import { getEventDispatcher } from '@/app/lib/queue-dispatch';

vi.mock('../stats-cache-events', () => ({
	buildStatsCacheRefreshEvents: vi.fn()
}));

vi.mock('@/app/lib/queue-dispatch', () => ({
	getEventDispatcher: vi.fn()
}));

vi.mock('@/app/api/queues/stats-cache-refresh-window/route', () => ({
	processStatsCacheRefreshWindowJob: vi.fn()
}));

const STATS_CACHE_REFRESH_WINDOW_TOPIC = 'stats-cache-refresh-window';
const STATS_CACHE_REFRESH_DISPATCH_MODE_ENV_VAR = 'STATS_CACHE_REFRESH_DISPATCH_MODE';

describe('dispatchStatsCacheRefreshEvents', () => {
	let dispatchMock: Mock<(event: unknown) => Promise<void>>;

	beforeEach(async () => {
		vi.mocked(buildStatsCacheRefreshEvents).mockReset();
		vi.mocked(getEventDispatcher).mockReset();
		dispatchMock = vi.fn(async () => {});
		vi.mocked(getEventDispatcher).mockReturnValue(dispatchMock);
	});

	it('builds events from the given ids/dates/species and dispatches every one, in order, via a dispatcher built once per call', async () => {
		const events = [
			{
				importJobId: 42,
				rpcParams: { ringing_group_filter: 7 },
				affectedSpeciesIds: [3]
			},
			{
				importJobId: 42,
				rpcParams: {
					ringing_group_filter: 7,
					group_by_time_period: 'day' as const,
					from_date: '2024-06-01',
					to_date: '2024-06-01'
				},
				affectedSpeciesIds: [3]
			}
		];
		vi.mocked(buildStatsCacheRefreshEvents).mockReturnValue(events);

		const { processStatsCacheRefreshWindowJob } = await import(
			'@/app/api/queues/stats-cache-refresh-window/route'
		);

		await dispatchStatsCacheRefreshEvents(42, 7, ['2024-06-01'], [3]);

		expect(buildStatsCacheRefreshEvents).toHaveBeenCalledWith(
			42,
			7,
			['2024-06-01'],
			[3]
		);
		expect(getEventDispatcher).toHaveBeenCalledWith(
			STATS_CACHE_REFRESH_WINDOW_TOPIC,
			STATS_CACHE_REFRESH_DISPATCH_MODE_ENV_VAR,
			processStatsCacheRefreshWindowJob
		);
		// Built once, not once per event.
		expect(getEventDispatcher).toHaveBeenCalledTimes(1);
		expect(dispatchMock).toHaveBeenCalledTimes(2);
		expect(dispatchMock).toHaveBeenNthCalledWith(1, events[0]);
		expect(dispatchMock).toHaveBeenNthCalledWith(2, events[1]);
	});

	it('logs and swallows a dispatch failure rather than throwing, merging logContext onto importJobId/ringingGroupId', async () => {
		vi.mocked(buildStatsCacheRefreshEvents).mockReturnValue([
			{
				importJobId: 42,
				rpcParams: { ringing_group_filter: 7 },
				affectedSpeciesIds: [3]
			}
		]);
		dispatchMock.mockRejectedValueOnce(new Error('queue unavailable'));
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(
			dispatchStatsCacheRefreshEvents(42, 7, ['2024-06-01'], [3], {
				csvFilePath: '/fake/alpha.csv'
			})
		).resolves.toBeUndefined();

		expect(errorSpy).toHaveBeenCalledWith(
			'Failed to dispatch stats-cache-refresh-window events',
			{ importJobId: 42, ringingGroupId: 7, csvFilePath: '/fake/alpha.csv' },
			expect.any(Error)
		);
	});

	it('defaults logContext to nothing extra when the caller passes none', async () => {
		vi.mocked(buildStatsCacheRefreshEvents).mockReturnValue([
			{
				importJobId: 42,
				rpcParams: { ringing_group_filter: 7 },
				affectedSpeciesIds: [3]
			}
		]);
		dispatchMock.mockRejectedValueOnce(new Error('queue unavailable'));
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		await dispatchStatsCacheRefreshEvents(42, 7, ['2024-06-01'], [3]);

		expect(errorSpy).toHaveBeenCalledWith(
			'Failed to dispatch stats-cache-refresh-window events',
			{ importJobId: 42, ringingGroupId: 7 },
			expect.any(Error)
		);
	});
});
