import { format } from 'date-fns';

const YEAR_PATTERN = /^\d{4}$/;
const MONTH_PATTERN = /^(0[1-9]|1[0-2])$/;

export function parseYearParam(year: string): number | null {
	if (!YEAR_PATTERN.test(year)) {
		return null;
	}
	return Number(year);
}

export function parseMonthParam(month: string): number | null {
	if (!MONTH_PATTERN.test(month)) {
		return null;
	}
	return Number(month);
}

export function buildAllTimeHeading(): string {
	return 'All time highlights';
}

export function buildYearHeading(year: number): string {
	return `${year} highlights`;
}

export function buildYearMonthHeading(year: number, month: number): string {
	const monthDate = new Date(year, month - 1, 1);
	return `${format(monthDate, 'LLLL')} ${year} highlights`;
}
