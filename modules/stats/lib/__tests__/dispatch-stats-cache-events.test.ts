import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
	dispatchManualStatsCacheRegenerateEvent,
	dispatchStatsCacheRefreshEvents
} from '../dispatch-stats-cache-events';
import { buildStatsCacheRefreshEvents } from '../stats-cache-events';
import { getEventDispatcher } from '@/app/lib/queue-dispatch';
import type { StatsCacheRefreshEvent } from '../../types';

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

describe('dispatchManualStatsCacheRegenerateEvent', () => {
	let dispatchMock: Mock<(event: unknown) => Promise<void>>;

	beforeEach(() => {
		vi.mocked(buildStatsCacheRefreshEvents).mockReset();
		vi.mocked(getEventDispatcher).mockReset();
		dispatchMock = vi.fn(async () => {});
		vi.mocked(getEventDispatcher).mockReturnValue(dispatchMock);
	});

	/** The single event the call under test dispatched. */
	const dispatchedEvent = () => dispatchMock.mock.calls[0][0] as StatsCacheRefreshEvent;

	it('builds one event with the given groupId/temporalUnit and dispatches it through the existing topic', async () => {
		const { processStatsCacheRefreshWindowJob } = await import(
			'@/app/api/queues/stats-cache-refresh-window/route'
		);

		await dispatchManualStatsCacheRegenerateEvent({
			groupId: 7,
			temporalUnit: 'month'
		});

		expect(getEventDispatcher).toHaveBeenCalledExactlyOnceWith(
			STATS_CACHE_REFRESH_WINDOW_TOPIC,
			STATS_CACHE_REFRESH_DISPATCH_MODE_ENV_VAR,
			processStatsCacheRefreshWindowJob
		);
		expect(dispatchMock).toHaveBeenCalledTimes(1);
		expect(dispatchedEvent().rpcParams).toMatchObject({
			ringing_group_filter: 7,
			group_by_time_period: 'month'
		});
		// The date-derived, up-to-five-events builder is the import path's, not
		// this one's — the scope here is already decided by the caller.
		expect(buildStatsCacheRefreshEvents).not.toHaveBeenCalled();
	});

	it('stamps rpcParams.periods and affectedDates from the same periods list when provided', async () => {
		const periods = ['2024-03-01', '2024-04-01'];

		await dispatchManualStatsCacheRegenerateEvent({
			groupId: 7,
			temporalUnit: 'month',
			periods
		});

		// Both, so `deriveStatsCacheRefreshParams` finds the list whichever field
		// its per-temporal-unit branching reaches for.
		expect(dispatchedEvent().rpcParams.periods).toEqual(periods);
		expect(dispatchedEvent().affectedDates).toEqual(periods);
	});

	it('omits periods/affectedDates entirely when none are given (full-width regenerate for that temporal unit)', async () => {
		await dispatchManualStatsCacheRegenerateEvent({
			groupId: 7,
			temporalUnit: 'day'
		});

		expect(dispatchedEvent().rpcParams).not.toHaveProperty('periods');
		expect(dispatchedEvent()).not.toHaveProperty('affectedDates');
	});

	it('omits rpcParams.group_by_time_period for the all-time temporal unit', async () => {
		await dispatchManualStatsCacheRegenerateEvent({
			groupId: 7,
			temporalUnit: 'all-time'
		});

		expect(dispatchedEvent().rpcParams).toEqual({ ringing_group_filter: 7 });
	});

	it('omits affectedSpeciesIds when speciesIds is not given, passing it through unchanged otherwise', async () => {
		await dispatchManualStatsCacheRegenerateEvent({
			groupId: 7,
			temporalUnit: 'year'
		});

		expect(dispatchedEvent()).not.toHaveProperty('affectedSpeciesIds');

		dispatchMock.mockClear();
		await dispatchManualStatsCacheRegenerateEvent({
			groupId: 7,
			temporalUnit: 'year',
			speciesIds: [3, 1]
		});

		expect(dispatchedEvent().affectedSpeciesIds).toEqual([3, 1]);
	});

	it('omits importJobId on the built event', async () => {
		await dispatchManualStatsCacheRegenerateEvent({
			groupId: 7,
			temporalUnit: 'all-time'
		});

		expect(dispatchedEvent()).not.toHaveProperty('importJobId');
	});

	it('logs and swallows a dispatch failure rather than throwing, merging logContext onto groupId/temporalUnit', async () => {
		dispatchMock.mockRejectedValueOnce(new Error('queue unavailable'));
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(
			dispatchManualStatsCacheRegenerateEvent(
				{ groupId: 7, temporalUnit: 'month' },
				{ triggeredBy: 'consistency-checker' }
			)
		).resolves.toBeUndefined();

		expect(errorSpy).toHaveBeenCalledWith(
			'Failed to dispatch a manual stats-cache-regenerate event',
			{
				groupId: 7,
				temporalUnit: 'month',
				triggeredBy: 'consistency-checker'
			},
			expect.any(Error)
		);
	});
});
