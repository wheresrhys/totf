import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dispatchStatsCacheRefreshEvents,buildStatsCacheRefreshEvents ,dispatchStatsCacheRefreshEvent } from '../stats-cache-events';
vi.mock('../stats-cache-events', () => ({
  buildStatsCacheRefreshEvents: vi.fn()
}));

vi.mock('../stats-cache-events', () => ({
  dispatchStatsCacheRefreshEvent: vi.fn()
}));



describe('dispatchStatsCacheRefreshEvents', () => {
  beforeEach(() => {
    vi.mocked(buildStatsCacheRefreshEvents).mockReset();
    vi.mocked(dispatchStatsCacheRefreshEvent).mockReset();
  });

  it('builds events from the given ids/dates/species and dispatches every one, in order', async () => {
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
    vi.mocked(dispatchStatsCacheRefreshEvent).mockResolvedValue(undefined);

    await dispatchStatsCacheRefreshEvents(42, 7, ['2024-06-01'], [3]);

    expect(buildStatsCacheRefreshEvents).toHaveBeenCalledWith(
      42,
      7,
      ['2024-06-01'],
      [3]
    );
    expect(dispatchStatsCacheRefreshEvent).toHaveBeenNthCalledWith(
      1,
      events[0]
    );
    expect(dispatchStatsCacheRefreshEvent).toHaveBeenNthCalledWith(
      2,
      events[1]
    );
  });

  it('logs and swallows a dispatch failure rather than throwing, merging logContext onto importJobId/ringingGroupId', async () => {
    vi.mocked(buildStatsCacheRefreshEvents).mockReturnValue([
      {
        importJobId: 42,
        rpcParams: { ringing_group_filter: 7 },
        affectedSpeciesIds: [3]
      }
    ]);
    vi.mocked(dispatchStatsCacheRefreshEvent).mockRejectedValueOnce(
      new Error('queue unavailable')
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

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
    vi.mocked(dispatchStatsCacheRefreshEvent).mockRejectedValueOnce(
      new Error('queue unavailable')
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    await dispatchStatsCacheRefreshEvents(42, 7, ['2024-06-01'], [3]);

    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to dispatch stats-cache-refresh-window events',
      { importJobId: 42, ringingGroupId: 7 },
      expect.any(Error)
    );
  });
});
