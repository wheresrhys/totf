import { describe, it, expect } from 'vitest';
import { getAgeClass, isMistNetEncounter } from '../encounter';

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
		it('returns postjuv for age_code 3 with is_juv false (bare 3)', () => {
			expect(getAgeClass({ age_code: 3, is_juv: false })).toBe('postjuv');
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
			// age_code is typed `number` but the RPC can genuinely return null;
			// cast through `unknown` to exercise that real-world case.
			expect(
				// eslint-disable-next-line no-restricted-syntax -- see comment above
				getAgeClass({ age_code: null as unknown as number, is_juv: false })
			).toBe('unknown');
		});
	});
});

describe('isMistNetEncounter', () => {
	describe('usual cases', () => {
		it('returns true for capture_method "M"', () => {
			expect(isMistNetEncounter({ capture_method: 'M' })).toBe(true);
		});

		it('returns false for an explicit non-"M" code (e.g. "C")', () => {
			expect(isMistNetEncounter({ capture_method: 'C' })).toBe(false);
		});
	});

	describe('edge cases — unset capture_method defaults to mist-net', () => {
		it('returns true for a null capture_method', () => {
			expect(isMistNetEncounter({ capture_method: null })).toBe(true);
		});

		it('returns true for an empty-string capture_method', () => {
			expect(isMistNetEncounter({ capture_method: '' })).toBe(true);
		});
	});
});
