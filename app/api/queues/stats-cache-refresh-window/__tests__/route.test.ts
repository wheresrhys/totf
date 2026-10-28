import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StatsCacheRefreshEvent } from '../../../../../modules/stats/stats-cache-refresh-events';

// Named with a `Mock` suffix so the `ImportJobTracker` stand-in below can carry
// a field of the real method's name without shadowing it in its own initializer.
const markStatsCacheRefreshedMock = vi.fn();
const refreshSimpleStatsCache = vi.fn();
const getAuthenticatedSupabaseClientForGroup = vi.fn();

// Mocked for the whole file rather than per-describe: every failure path below
// deliberately logs, and an unmocked `console.error` would spray real stack
// traces over a passing run. `vi.clearAllMocks()` in `beforeEach` resets its
// recorded calls without dropping the no-op implementation.
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

vi.mock('../../../../../lib/demon-import', () => ({
	ImportJobTracker: class {
		markStatsCacheRefreshed = markStatsCacheRefreshedMock;
		constructor(public supabaseClient: unknown) {}
	}
}));

vi.mock('../../../../../modules/stats/stats-cache-refresh', () => ({
	refreshSimpleStatsCache: (...args: unknown[]) =>
		refreshSimpleStatsCache(...args)
}));

vi.mock('../../../../lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClientForGroup: (...args: unknown[]) =>
		getAuthenticatedSupabaseClientForGroup(...args)
}));

const {
	deriveStatsCacheRefreshParams,
	processStatsCacheRefreshWindowJob
	// Imported after the mocks above are registered — `vi.mock` is hoisted, but
	// the mocked modules' factories only run on first import of the module
	// under test.
} = await import('../route');

const IMPORT_JOB_ID = 42;
const GROUP_ID = 7;

/** A dispatched event, as `buildStatsCacheRefreshEvents` (#1154) stamps them. */
function statsCacheRefreshEvent({
	importJobId = IMPORT_JOB_ID,
	ringingGroupId = GROUP_ID,
	groupByTimePeriod,
	periods,
	affectedDates,
	affectedSpeciesIds = []
}: {
	importJobId?: number;
	ringingGroupId?: number;
	groupByTimePeriod?: 'day' | 'month' | 'month-squashed' | 'year';
	periods?: string[];
	affectedDates?: string[];
	affectedSpeciesIds?: number[];
} = {}): StatsCacheRefreshEvent {
	return {
		importJobId,
		rpcParams: {
			ringing_group_filter: ringingGroupId,
			...(groupByTimePeriod ? { group_by_time_period: groupByTimePeriod } : {}),
			...(periods ? { periods } : {})
		},
		...(affectedDates ? { affectedDates } : {}),
		affectedSpeciesIds
	};
}

/** The all-time event: no `group_by_time_period` key at all (#1154). */
const allTimeEvent = () => statsCacheRefreshEvent();

const dayEvent = (affectedDates: string[]) =>
	statsCacheRefreshEvent({ groupByTimePeriod: 'day', affectedDates });

describe('deriving groupId/temporalUnit/periods from the event', () => {
	it('reads groupId from rpcParams.ringing_group_filter', () => {
		expect(
			deriveStatsCacheRefreshParams(
				statsCacheRefreshEvent({ ringingGroupId: 99 })
			)
		).toMatchObject({ groupId: 99 });
	});

	it('treats an event with no group_by_time_period key as the all-time temporal unit', () => {
		expect(deriveStatsCacheRefreshParams(allTimeEvent())).toMatchObject({
			temporalUnit: 'all-time'
		});
	});

	it('sources periods from affectedDates for the day temporal unit, not rpcParams.periods', () => {
		const event = dayEvent(['2024-03-15', '2024-03-28']);
		// A day event that also (wrongly) carried rpcParams.periods must still
		// read its exact days off affectedDates.
		event.rpcParams.periods = ['2024-03-01'];

		expect(deriveStatsCacheRefreshParams(event)).toMatchObject({
			temporalUnit: 'day',
			periods: ['2024-03-15', '2024-03-28']
		});
	});

	it('sources periods from rpcParams.periods for the month, year and month-squashed temporal units', () => {
		expect(
			deriveStatsCacheRefreshParams(
				statsCacheRefreshEvent({
					groupByTimePeriod: 'month',
					periods: ['2024-03-01', '2024-04-01']
				})
			)
		).toMatchObject({
			temporalUnit: 'month',
			periods: ['2024-03-01', '2024-04-01']
		});

		expect(
			deriveStatsCacheRefreshParams(
				statsCacheRefreshEvent({
					groupByTimePeriod: 'year',
					periods: ['2024-01-01']
				})
			)
		).toMatchObject({ temporalUnit: 'year', periods: ['2024-01-01'] });

		// Sentinel-year squashed-month periods (#1178) — a narrowing unit handed
		// no periods refreshes nothing, so dropping these would silently stop the
		// month-squashed cache refreshing at all.
		expect(
			deriveStatsCacheRefreshParams(
				statsCacheRefreshEvent({
					groupByTimePeriod: 'month-squashed',
					periods: ['2000-03-01', '2000-04-01']
				})
			)
		).toMatchObject({
			temporalUnit: 'month-squashed',
			periods: ['2000-03-01', '2000-04-01']
		});
	});

	it('passes undefined periods for the all-time temporal unit', () => {
		expect(deriveStatsCacheRefreshParams(allTimeEvent())).toEqual({
			groupId: GROUP_ID,
			temporalUnit: 'all-time',
			periods: undefined,
			speciesIds: []
		});
	});

	it('carries event.affectedSpeciesIds straight through regardless of temporal unit', () => {
		expect(
			deriveStatsCacheRefreshParams(
				statsCacheRefreshEvent({ affectedSpeciesIds: [3, 1] })
			)
		).toMatchObject({ speciesIds: [3, 1] });
		expect(
			deriveStatsCacheRefreshParams(
				statsCacheRefreshEvent({
					groupByTimePeriod: 'day',
					affectedDates: ['2024-03-15'],
					affectedSpeciesIds: [3, 1]
				})
			)
		).toMatchObject({ speciesIds: [3, 1] });
		expect(
			deriveStatsCacheRefreshParams(
				statsCacheRefreshEvent({
					groupByTimePeriod: 'month',
					periods: ['2024-03-01'],
					affectedSpeciesIds: [3, 1]
				})
			)
		).toMatchObject({ speciesIds: [3, 1] });
	});
});

describe('processStatsCacheRefreshWindowJob', () => {
	const supabaseClient = { id: 'group-scoped-client' };

	beforeEach(() => {
		vi.clearAllMocks();
		getAuthenticatedSupabaseClientForGroup.mockResolvedValue(supabaseClient);
		refreshSimpleStatsCache.mockResolvedValue(undefined);
		markStatsCacheRefreshedMock.mockResolvedValue(undefined);
	});

	it("mints a group-scoped client from the event's derived groupId", async () => {
		await processStatsCacheRefreshWindowJob(
			statsCacheRefreshEvent({ ringingGroupId: 123 })
		);

		expect(getAuthenticatedSupabaseClientForGroup).toHaveBeenCalledWith(123);
	});

	it("calls refreshSimpleStatsCache for the event's temporal unit, passing the derived periods", async () => {
		await processStatsCacheRefreshWindowJob(
			statsCacheRefreshEvent({
				groupByTimePeriod: 'year',
				periods: ['2024-01-01']
			})
		);

		expect(refreshSimpleStatsCache).toHaveBeenCalledWith(supabaseClient, {
			groupId: GROUP_ID,
			temporalUnit: 'year',
			periods: ['2024-01-01'],
			speciesIds: [],
			importJobId: IMPORT_JOB_ID
		});
	});

	it("marks the temporal unit's ImportJobs column succeeded when the refresh resolves", async () => {
		await processStatsCacheRefreshWindowJob(
			dayEvent(['2024-03-15', '2024-03-28'])
		);

		expect(markStatsCacheRefreshedMock).toHaveBeenCalledWith(
			IMPORT_JOB_ID,
			'day',
			'succeeded'
		);
	});

	it("marks the temporal unit's ImportJobs column failed when refreshSimpleStatsCache rejects", async () => {
		refreshSimpleStatsCache.mockRejectedValue(
			new Error('simple refresh blew up')
		);

		await processStatsCacheRefreshWindowJob(
			statsCacheRefreshEvent({ groupByTimePeriod: 'month-squashed' })
		);

		expect(markStatsCacheRefreshedMock).toHaveBeenCalledWith(
			IMPORT_JOB_ID,
			'month-squashed',
			'failed'
		);
	});

	it("does not call markStatsCacheRefreshed for a different temporal unit's column", async () => {
		await processStatsCacheRefreshWindowJob(
			statsCacheRefreshEvent({
				groupByTimePeriod: 'month',
				periods: ['2024-03-01']
			})
		);

		expect(markStatsCacheRefreshedMock).toHaveBeenCalledExactlyOnceWith(
			IMPORT_JOB_ID,
			'month',
			'succeeded'
		);
	});

	it('resolves without throwing even when the refresh rejects', async () => {
		refreshSimpleStatsCache.mockRejectedValue(new Error('simple'));

		await expect(
			processStatsCacheRefreshWindowJob(allTimeEvent())
		).resolves.toBeUndefined();
	});

	it('logs and swallows an error from markStatsCacheRefreshed itself, without throwing', async () => {
		const trackerError = new Error('ImportJobs write failed');
		markStatsCacheRefreshedMock.mockRejectedValue(trackerError);

		await expect(
			processStatsCacheRefreshWindowJob(allTimeEvent())
		).resolves.toBeUndefined();
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				importJobId: IMPORT_JOB_ID,
				groupId: GROUP_ID,
				temporalUnit: 'all-time',
				refreshOutcome: 'succeeded'
			}),
			trackerError
		);
	});
});
