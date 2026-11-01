import { describe, it, expect } from 'vitest';
import { batchPeriodsBySessionDateSpan } from '../rpc-params';

/** `YYYY-MM-DD` `dayOffset` days after 2026-01-01, for a deterministic run of consecutive dates. */
function dateAtOffset(dayOffset: number): string {
	return new Date(Date.UTC(2026, 0, 1 + dayOffset)).toISOString().slice(0, 10);
}

describe('batchPeriodsBySessionDateSpan', () => {
	it('keeps contiguous real session dates within the batch size as one batch', () => {
		const dates = Array.from({ length: 10 }, (_, i) => dateAtOffset(i));

		expect(batchPeriodsBySessionDateSpan(dates, dates, 50)).toEqual([dates]);
	});

	it('splits contiguous real session dates exceeding the batch size into successive full-size batches', () => {
		const dates = Array.from({ length: 120 }, (_, i) => dateAtOffset(i));

		const batches = batchPeriodsBySessionDateSpan(dates, dates, 50);

		expect(batches.map((batch) => batch.length)).toEqual([50, 50, 20]);
		expect(batches.flat()).toEqual(dates);
	});

	it('splits two widely-spaced touched periods into separate single-period batches', () => {
		// The case the first (period-count) design draft got wrong: only 2
		// touched periods, but they're the group's very first and very last
		// session ever, with a long run of real session dates between them.
		const allSessionDates = Array.from({ length: 1000 }, (_, i) =>
			dateAtOffset(i)
		);
		const firstEverDate = allSessionDates[0];
		const lastEverDate = allSessionDates[allSessionDates.length - 1];

		const batches = batchPeriodsBySessionDateSpan(
			[firstEverDate, lastEverDate],
			allSessionDates,
			50
		);

		expect(batches).toEqual([[firstEverDate], [lastEverDate]]);
	});

	it('sorts unsorted input periods before batching', () => {
		const dates = Array.from({ length: 5 }, (_, i) => dateAtOffset(i));
		const unsorted = [dates[3], dates[0], dates[4], dates[1], dates[2]];

		expect(batchPeriodsBySessionDateSpan(unsorted, dates, 50)).toEqual([dates]);
	});

	it('gives a touched period with no matching real session date its own standalone batch', () => {
		const dates = Array.from({ length: 5 }, (_, i) => dateAtOffset(i));
		const unknownPeriod = dateAtOffset(999);

		const batches = batchPeriodsBySessionDateSpan(
			[...dates, unknownPeriod],
			dates,
			50
		);

		expect(batches).toEqual([dates, [unknownPeriod]]);
	});

	it('returns one batch per period when groupSessionDates is empty', () => {
		const dates = Array.from({ length: 3 }, (_, i) => dateAtOffset(i));

		expect(batchPeriodsBySessionDateSpan(dates, [], 50)).toEqual(
			dates.map((date) => [date])
		);
	});
});
