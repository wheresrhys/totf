import { describe, it, expect } from 'vitest';
import { getAgeClass } from '../encounter';

describe('getAgeClass', () => {
	describe('usual cases', () => {
		it('returns pullus for age_code 1 with is_juv false (true nestling capture)', () => {
			expect(getAgeClass({ age_code: 1, is_juv: false })).toBe('pullus');
		});

		it('returns juv for age_code 1 with is_juv true (genuine 1J juvenile)', () => {
			expect(getAgeClass({ age_code: 1, is_juv: true })).toBe('juv');
		});

		it('returns juv for age_code 3 with is_juv true (3J)', () => {
			expect(getAgeClass({ age_code: 3, is_juv: true })).toBe('juv');
		});
	});

	describe('structure — age_code branches', () => {
		it('returns 1st-year for age_code 3 with is_juv false (bare 3)', () => {
			expect(getAgeClass({ age_code: 3, is_juv: false })).toBe('1st-year');
		});

		it('returns adult for age_code greater than 3 (e.g. 6)', () => {
			expect(getAgeClass({ age_code: 6, is_juv: false })).toBe('adult');
		});

		it('returns unknown for age_code 2', () => {
			expect(getAgeClass({ age_code: 2, is_juv: false })).toBe('unknown');
		});
	});

	describe('edge cases', () => {
		it('returns unknown for a null age_code', () => {
			expect(
				getAgeClass({ age_code: null as unknown as number, is_juv: false })
			).toBe('unknown');
		});
	});
});
