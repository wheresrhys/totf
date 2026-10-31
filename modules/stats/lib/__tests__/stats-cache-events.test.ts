import { describe, it, expect } from 'vitest';
import { buildStatsCacheRefreshEvents } from '../stats-cache-events';

const IMPORT_JOB_ID = 42;
const RINGING_GROUP_ID = 7;

const SORTED_SPECIES_IDS = [1, 3];

function build(affectedDates: string[], affectedSpeciesIds: number[] = []) {
	return buildStatsCacheRefreshEvents(
		IMPORT_JOB_ID,
		RINGING_GROUP_ID,
		affectedDates,
		affectedSpeciesIds
	);
}

describe('the all-time event', () => {
	it('emits exactly one event with only ringing_group_filter set, no group_by_time_period/date/periods filters', () => {
		const events = build(['2024-06-01', '2024-07-15']);
		const allTimeEvents = events.filter(
			({ rpcParams }) => Object.keys(rpcParams).length === 1
		);
		expect(allTimeEvents).toHaveLength(1);
		expect(allTimeEvents[0]).toEqual({
			importJobId: IMPORT_JOB_ID,
			rpcParams: { ringing_group_filter: RINGING_GROUP_ID },
			affectedSpeciesIds: []
		});
	});

	it('emits the all-time event alongside the day-range event even for a single affected date', () => {
		const events = build(['2024-06-01']);
		expect(events).toContainEqual({
			importJobId: IMPORT_JOB_ID,
			rpcParams: { ringing_group_filter: RINGING_GROUP_ID },
			affectedSpeciesIds: []
		});
		expect(events).toContainEqual({
			importJobId: IMPORT_JOB_ID,
			rpcParams: {
				ringing_group_filter: RINGING_GROUP_ID,
				group_by_time_period: 'day',
				from_date: '2024-06-01',
				to_date: '2024-06-01'
			},
			affectedDates: ['2024-06-01'],
			affectedSpeciesIds: []
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
			affectedDates: ['2024-06-01', '2024-06-20', '2024-07-15'],
			affectedSpeciesIds: []
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
			affectedDates: ['2024-06-01'],
			affectedSpeciesIds: []
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

describe('the month event', () => {
	it('emits exactly one month event for multiple months touched, with every month in its periods array as a first-of-month date', () => {
		const events = build(['2024-06-01', '2024-06-20', '2025-07-15']);
		const monthEvents = events.filter(
			({ rpcParams }) => rpcParams.group_by_time_period === 'month'
		);
		expect(monthEvents).toEqual([
			{
				importJobId: IMPORT_JOB_ID,
				rpcParams: {
					ringing_group_filter: RINGING_GROUP_ID,
					group_by_time_period: 'month',
					periods: ['2024-06-01', '2025-07-01']
				},
				affectedSpeciesIds: []
			}
		]);
	});
});

describe('the month-squashed event', () => {
	it('emits one squashed-month period per distinct calendar month touched, as 2000-<mm>-01 strings', () => {
		const events = build(['2024-06-01', '2024-07-15', '2025-08-02']);
		const squashedMonthEvents = events.filter(
			({ rpcParams }) => rpcParams.group_by_time_period === 'month-squashed'
		);
		// Still exactly one event — one per temporal unit, not one per period.
		expect(squashedMonthEvents).toEqual([
			{
				importJobId: IMPORT_JOB_ID,
				rpcParams: {
					ringing_group_filter: RINGING_GROUP_ID,
					group_by_time_period: 'month-squashed',
					periods: ['2000-06-01', '2000-07-01', '2000-08-01']
				},
				affectedSpeciesIds: []
			}
		]);
	});

	it('collapses two affected dates in the same calendar month across different years into one period', () => {
		const events = build(['2024-06-01', '2025-06-20']);
		const squashedMonthEvent = events.find(
			({ rpcParams }) => rpcParams.group_by_time_period === 'month-squashed'
		);
		// The squash this whole temporal unit is about: June 2024 and June 2025
		// are the same squashed cell, so one period, not two.
		expect(squashedMonthEvent?.rpcParams.periods).toEqual(['2000-06-01']);
	});
});

describe('the year event', () => {
	it('emits exactly one year event for multiple years touched, with every year in its periods array as a first-of-year date', () => {
		const events = build(['2024-06-01', '2024-11-20', '2025-07-15']);
		const yearEvents = events.filter(
			({ rpcParams }) => rpcParams.group_by_time_period === 'year'
		);
		expect(yearEvents).toEqual([
			{
				importJobId: IMPORT_JOB_ID,
				rpcParams: {
					ringing_group_filter: RINGING_GROUP_ID,
					group_by_time_period: 'year',
					periods: ['2024-01-01', '2025-01-01']
				},
				affectedSpeciesIds: []
			}
		]);
	});
});

describe('how many events are emitted', () => {
	it('emits exactly 5 events — one per temporal unit — for a maximally scattered multi-month/multi-year import', () => {
		const events = build([
			'2023-01-05',
			'2023-04-18',
			'2024-02-29',
			'2024-09-01',
			'2025-12-31'
		]);
		expect(events).toHaveLength(5);
		// `undefined` is the all-time event — it omits the key entirely.
		expect(
			events.map(({ rpcParams }) => rpcParams.group_by_time_period)
		).toEqual([undefined, 'day', 'month', 'month-squashed', 'year']);
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

describe('affectedSpeciesIds scoping', () => {
	it('stamps the same deduped, sorted species ids onto every one of the five events, unlike affectedDates which only the day event carries', () => {
		const events = build(['2024-06-01', '2025-07-15'], [3, 1, 3]);
		expect(events).toHaveLength(5);
		for (const event of events) {
			expect(event.affectedSpeciesIds).toEqual(SORTED_SPECIES_IDS);
		}
	});

	it('is an empty array, not omitted, when the import touched no species an event could narrow by', () => {
		const events = build(['2024-06-01']);
		for (const event of events) {
			expect(event.affectedSpeciesIds).toEqual([]);
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
