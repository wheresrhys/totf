import { describe, it, expect } from 'vitest';
import { buildStatsCacheRefreshEvents } from '../stats-cache-refresh-events';

const IMPORT_JOB_ID = 42;
const RINGING_GROUP_ID = 7;

function build(affectedDates: string[]) {
	return buildStatsCacheRefreshEvents(
		IMPORT_JOB_ID,
		RINGING_GROUP_ID,
		affectedDates
	);
}

describe('the all-time event', () => {
	it('emits exactly one event with only ringing_group_filter set, no group_by_time_period/date/year/month filters', () => {
		const events = build(['2024-06-01', '2024-07-15']);
		const allTimeEvents = events.filter(
			({ rpcParams }) => Object.keys(rpcParams).length === 1
		);
		expect(allTimeEvents).toHaveLength(1);
		expect(allTimeEvents[0]).toEqual({
			importJobId: IMPORT_JOB_ID,
			rpcParams: { ringing_group_filter: RINGING_GROUP_ID }
		});
	});

	it('emits the all-time event alongside the day-range event even for a single affected date', () => {
		const events = build(['2024-06-01']);
		expect(events).toContainEqual({
			importJobId: IMPORT_JOB_ID,
			rpcParams: { ringing_group_filter: RINGING_GROUP_ID }
		});
		expect(events).toContainEqual({
			importJobId: IMPORT_JOB_ID,
			rpcParams: {
				ringing_group_filter: RINGING_GROUP_ID,
				group_by_time_period: 'day',
				from_date: '2024-06-01',
				to_date: '2024-06-01'
			},
			affectedDates: ['2024-06-01']
		});
	});
});

describe('the day-range event', () => {
	it('emits one event with group_by_time_period "day" spanning the min and max affected dates', () => {
		const events = build(['2024-07-15', '2024-06-01', '2024-06-20']);
		expect(events).toContainEqual({
			importJobId: IMPORT_JOB_ID,
			rpcParams: {
				ringing_group_filter: RINGING_GROUP_ID,
				group_by_time_period: 'day',
				from_date: '2024-06-01',
				to_date: '2024-07-15'
			},
			affectedDates: ['2024-06-01', '2024-06-20', '2024-07-15']
		});
	});

	it('uses the single date as both from_date and to_date when only one date is affected', () => {
		const events = build(['2024-06-01']);
		expect(events).toContainEqual({
			importJobId: IMPORT_JOB_ID,
			rpcParams: {
				ringing_group_filter: RINGING_GROUP_ID,
				group_by_time_period: 'day',
				from_date: '2024-06-01',
				to_date: '2024-06-01'
			},
			affectedDates: ['2024-06-01']
		});
	});

	it('sets affectedDates to the deduped, sorted list of affected dates when multiple dates are affected and the input is unsorted', () => {
		const events = build([
			'2024-07-15',
			'2024-06-01',
			'2024-06-20',
			'2024-06-01'
		]);
		const dayEvent = events.find(
			({ rpcParams }) => rpcParams.group_by_time_period === 'day'
		);
		expect(dayEvent?.affectedDates).toEqual([
			'2024-06-01',
			'2024-06-20',
			'2024-07-15'
		]);
	});
});

describe('month events', () => {
	it('emits one "month" event per distinct year+month pair, with year_filter and month_filter set', () => {
		const events = build(['2024-06-01', '2025-07-15']);
		expect(events).toContainEqual({
			importJobId: IMPORT_JOB_ID,
			rpcParams: {
				ringing_group_filter: RINGING_GROUP_ID,
				group_by_time_period: 'month',
				year_filter: 2024,
				month_filter: 6
			}
		});
		expect(events).toContainEqual({
			importJobId: IMPORT_JOB_ID,
			rpcParams: {
				ringing_group_filter: RINGING_GROUP_ID,
				group_by_time_period: 'month',
				year_filter: 2025,
				month_filter: 7
			}
		});
	});

	it('deduplicates two affected dates in the same calendar month into one month event', () => {
		const events = build(['2024-06-01', '2024-06-20']);
		const monthEvents = events.filter(
			({ rpcParams }) => rpcParams.group_by_time_period === 'month'
		);
		expect(monthEvents).toHaveLength(1);
		expect(monthEvents[0].rpcParams).toMatchObject({
			year_filter: 2024,
			month_filter: 6
		});
	});

	it('emits separate month events for dates in different months', () => {
		const events = build(['2024-06-01', '2024-07-01']);
		const monthEvents = events.filter(
			({ rpcParams }) => rpcParams.group_by_time_period === 'month'
		);
		expect(monthEvents).toHaveLength(2);
	});
});

describe('squashed-month events', () => {
	it('emits one "month-squashed" event per distinct month number, with month_filter only and no year_filter', () => {
		const events = build(['2024-06-01', '2025-07-15']);
		expect(events).toContainEqual({
			importJobId: IMPORT_JOB_ID,
			rpcParams: {
				ringing_group_filter: RINGING_GROUP_ID,
				group_by_time_period: 'month-squashed',
				month_filter: 6
			}
		});
		expect(events).toContainEqual({
			importJobId: IMPORT_JOB_ID,
			rpcParams: {
				ringing_group_filter: RINGING_GROUP_ID,
				group_by_time_period: 'month-squashed',
				month_filter: 7
			}
		});
	});

	it('deduplicates two affected dates with the same month in different years into one squashed-month event', () => {
		const events = build(['2024-06-01', '2025-06-20']);
		const squashedMonthEvents = events.filter(
			({ rpcParams }) => rpcParams.group_by_time_period === 'month-squashed'
		);
		expect(squashedMonthEvents).toHaveLength(1);
		expect(squashedMonthEvents[0].rpcParams).toMatchObject({ month_filter: 6 });
	});
});

describe('year events', () => {
	it('emits one "year" event per distinct year, with year_filter only and no month_filter/from_date/to_date', () => {
		const events = build(['2024-06-01', '2025-07-15']);
		expect(events).toContainEqual({
			importJobId: IMPORT_JOB_ID,
			rpcParams: {
				ringing_group_filter: RINGING_GROUP_ID,
				group_by_time_period: 'year',
				year_filter: 2024
			}
		});
		expect(events).toContainEqual({
			importJobId: IMPORT_JOB_ID,
			rpcParams: {
				ringing_group_filter: RINGING_GROUP_ID,
				group_by_time_period: 'year',
				year_filter: 2025
			}
		});
	});

	it('deduplicates two affected dates in the same year into one year event', () => {
		const events = build(['2024-06-01', '2024-11-20']);
		const yearEvents = events.filter(
			({ rpcParams }) => rpcParams.group_by_time_period === 'year'
		);
		expect(yearEvents).toHaveLength(1);
		expect(yearEvents[0].rpcParams).toMatchObject({ year_filter: 2024 });
	});
});

describe('stamped fields', () => {
	it('stamps every emitted event with the given importJobId and ringing_group_filter', () => {
		const events = build(['2024-06-01', '2025-07-15']);
		expect(events.length).toBeGreaterThan(0);
		for (const event of events) {
			expect(event.importJobId).toBe(IMPORT_JOB_ID);
			expect(event.rpcParams.ringing_group_filter).toBe(RINGING_GROUP_ID);
		}
	});
});

describe('no affected dates', () => {
	it('returns an empty array when affectedDates is empty', () => {
		expect(build([])).toEqual([]);
	});
});

describe('affectedDates scoping', () => {
	it('does not set affectedDates on the all-time, month, month-squashed, or year events', () => {
		const events = build(['2024-06-01', '2025-07-15']);
		const nonDayEvents = events.filter(
			({ rpcParams }) => rpcParams.group_by_time_period !== 'day'
		);
		expect(nonDayEvents.length).toBeGreaterThan(0);
		for (const event of nonDayEvents) {
			expect('affectedDates' in event).toBe(false);
		}
	});
});

describe('ordering', () => {
	it('returns events in a stable, sorted order regardless of input array order', () => {
		const forwardOrder = build(['2024-06-01', '2024-07-15', '2025-01-10']);
		const reverseOrder = build(['2025-01-10', '2024-07-15', '2024-06-01']);
		expect(reverseOrder).toEqual(forwardOrder);
	});
});
