import {
	MONTH_NAMES,
	getLastDayOfMonth,
	type EffectiveDateRange,
	type TemporalSelection
} from '@/app/lib/temporal-filter';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';

export type ReviewPeriod = { timePeriod: string; label: string };
export type UsableWindow = {
	fromDate: string;
	toDate: string;
	recurringMonth?: number;
};

// Only a window with both bounds set can be walked to completion — a
// one-sided bound has no sane loop terminator, same as "nothing selected at
// all" (which `isEmptySelection` distinguishes separately, since the review
// page treats that case differently).
export function hasUsableWindow(
	effectiveDateRange: EffectiveDateRange | null
): effectiveDateRange is UsableWindow {
	return !!effectiveDateRange?.fromDate && !!effectiveDateRange?.toDate;
}

export function isEmptySelection({
	year,
	month,
	fromDate,
	toDate
}: TemporalSelection): boolean {
	return !year && !month && !fromDate && !toDate;
}

function pad2(value: number): string {
	return String(value).padStart(2, '0');
}

function dateString(year: number, month: number, day: number): string {
	return `${year}-${pad2(month)}-${pad2(day)}`;
}

function parseDateParts(date: string): [number, number, number] {
	const [year, month, day] = date.split('-').map(Number);
	return [year, month, day];
}

function enumerateDays(fromDate: string, toDate: string): ReviewPeriod[] {
	const periods: ReviewPeriod[] = [];
	let [year, month, day] = parseDateParts(fromDate);
	while (dateString(year, month, day) <= toDate) {
		periods.push({
			timePeriod: dateString(year, month, day),
			label: `${day} ${MONTH_NAMES[month - 1]} ${year}`
		});
		day += 1;
		if (day > getLastDayOfMonth(year, month)) {
			day = 1;
			month += 1;
		}
		if (month > 12) {
			month = 1;
			year += 1;
		}
	}
	return periods;
}

function enumerateMonths(fromDate: string, toDate: string): ReviewPeriod[] {
	const periods: ReviewPeriod[] = [];
	let [year, month] = parseDateParts(fromDate);
	const [toYear, toMonth] = parseDateParts(toDate);
	while (year < toYear || (year === toYear && month <= toMonth)) {
		periods.push({
			timePeriod: dateString(year, month, 1),
			label: `${MONTH_NAMES[month - 1]} ${year}`
		});
		month += 1;
		if (month > 12) {
			month = 1;
			year += 1;
		}
	}
	return periods;
}

function enumerateYears(fromDate: string, toDate: string): ReviewPeriod[] {
	const [fromYear] = parseDateParts(fromDate);
	const [toYear] = parseDateParts(toDate);
	const periods: ReviewPeriod[] = [];
	for (let year = fromYear; year <= toYear; year++) {
		periods.push({ timePeriod: dateString(year, 1, 1), label: String(year) });
	}
	return periods;
}

// Same overlap test as temporal-filter.ts's `monthRecursWithinBounds`, but
// returning the clipped bounds (needed for day-granularity enumeration)
// instead of a boolean.
function clipRecurringMonthToYear(
	year: number,
	month: number,
	fromDate: string,
	toDate: string
): { start: string; end: string } | null {
	const lastDay = getLastDayOfMonth(year, month);
	const monthStart = dateString(year, month, 1);
	const monthEnd = dateString(year, month, lastDay);
	const start = monthStart < fromDate ? fromDate : monthStart;
	const end = monthEnd > toDate ? toDate : monthEnd;
	return start > end ? null : { start, end };
}

function enumerateRecurringMonth(
	fromDate: string,
	toDate: string,
	recurringMonth: number,
	temporalUnit: TemporalUnit
): ReviewPeriod[] {
	const [fromYear] = parseDateParts(fromDate);
	const [toYear] = parseDateParts(toDate);
	const periods: ReviewPeriod[] = [];
	for (let year = fromYear; year <= toYear; year++) {
		const clipped = clipRecurringMonthToYear(
			year,
			recurringMonth,
			fromDate,
			toDate
		);
		if (!clipped) continue;
		if (temporalUnit === 'day') {
			periods.push(...enumerateDays(clipped.start, clipped.end));
		} else {
			// 'month' and 'year' granularity collapse to the same
			// one-period-per-spanned-year result here: there's only ever one
			// occurrence of the recurring month per year to show.
			periods.push({
				timePeriod: dateString(year, recurringMonth, 1),
				label: `${MONTH_NAMES[recurringMonth - 1]} ${year}`
			});
		}
	}
	return periods;
}

export function enumerateReviewPeriods(
	window: UsableWindow,
	temporalUnit: TemporalUnit
): ReviewPeriod[] {
	if (window.recurringMonth) {
		return enumerateRecurringMonth(
			window.fromDate,
			window.toDate,
			window.recurringMonth,
			temporalUnit
		);
	}
	switch (temporalUnit) {
		case 'day':
			return enumerateDays(window.fromDate, window.toDate);
		case 'month':
			return enumerateMonths(window.fromDate, window.toDate);
		case 'year':
			return enumerateYears(window.fromDate, window.toDate);
	}
}
