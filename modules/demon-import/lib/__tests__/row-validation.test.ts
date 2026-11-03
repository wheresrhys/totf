import { describe, it, expect } from 'vitest';
import {
	convertDateFormat,
	isRinglessRingNo,
	transformEmptyStringsToNull
} from '../row-validation';

describe('transformEmptyStringsToNull', () => {
	it('converts empty strings to null', () => {
		expect(transformEmptyStringsToNull({ a: '', b: 'hello' })).toEqual({
			a: null,
			b: 'hello'
		});
	});

	it('trims whitespace-only strings to null', () => {
		expect(transformEmptyStringsToNull({ a: '  ' })).toEqual({ a: null });
	});

	it('trims whitespace from non-empty strings', () => {
		expect(transformEmptyStringsToNull({ a: ' hello ' })).toEqual({
			a: 'hello'
		});
	});

	it('passes through non-string values unchanged', () => {
		expect(transformEmptyStringsToNull({ a: 42, b: null, c: true })).toEqual({
			a: 42,
			b: null,
			c: true
		});
	});
});

describe('isRinglessRingNo', () => {
	it('returns true for null, undefined and empty string', () => {
		expect(isRinglessRingNo(null)).toBe(true);
		expect(isRinglessRingNo(undefined)).toBe(true);
		expect(isRinglessRingNo('')).toBe(true);
	});

	it("returns true for the '-' casualty sentinel", () => {
		expect(isRinglessRingNo('-')).toBe(true);
	});

	it("returns true for '-' with surrounding whitespace", () => {
		expect(isRinglessRingNo(' - ')).toBe(true);
	});

	it('returns false for a real ring number', () => {
		expect(isRinglessRingNo('A000001')).toBe(false);
	});
});

describe('convertDateFormat', () => {
	it('converts DD/MM/YYYY to YYYY-MM-DD', () => {
		expect(convertDateFormat('01/06/2024')).toBe('2024-06-01');
	});
});
