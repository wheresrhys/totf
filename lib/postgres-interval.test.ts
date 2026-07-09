import { describe, expect, it } from 'vitest';
import {
	formatMinutesForDisplay,
	formatPostgresIntervalForDisplay,
	postgresIntervalToHours,
	postgresIntervalToMinutes,
	postgresIntervalToSeconds
} from './postgres-interval';

describe('postgresIntervalToSeconds', () => {
	it('parses HH:MM:SS', () => {
		expect(postgresIntervalToSeconds('02:30:00')).toBe(9000);
	});

	it('parses days and time', () => {
		expect(postgresIntervalToSeconds('1 day 01:00:00')).toBe(90000);
	});

	it('handles empty', () => {
		expect(postgresIntervalToSeconds('')).toBe(0);
	});
});

describe('postgresIntervalToHours', () => {
	it('converts', () => {
		expect(postgresIntervalToHours('01:00:00')).toBe(1);
	});
});

describe('postgresIntervalToMinutes', () => {
	it('converts', () => {
		expect(postgresIntervalToMinutes('01:00:00')).toBe(60);
	});
});

describe('formatPostgresIntervalForDisplay', () => {
	it('formats hours and minutes', () => {
		expect(formatPostgresIntervalForDisplay('02:01:00')).toBe('2h 1m');
	});
});

describe('formatMinutesForDisplay', () => {
	it('returns "0m" for 0 minutes', () => {
		expect(formatMinutesForDisplay(0)).toBe('0m');
	});

	it('returns minutes only for < 60 minutes', () => {
		expect(formatMinutesForDisplay(45)).toBe('45m');
	});

	it('returns hours only when no remainder', () => {
		expect(formatMinutesForDisplay(120)).toBe('2h');
	});

	it('returns hours and minutes', () => {
		expect(formatMinutesForDisplay(90)).toBe('1h 30m');
	});
});
