import { describe, it, expect } from 'vitest';
import { deriveMeasurementRange } from '../measurement-range';

describe('deriveMeasurementRange', () => {
	describe('usual cases', () => {
		it('returns a range for differing measurements', () => {
			expect(deriveMeasurementRange([67, 69, 68])).toEqual({
				min: 67,
				max: 69
			});
		});

		it('returns a zero-width range when all measurements are equal', () => {
			expect(deriveMeasurementRange([68, 68, 68])).toEqual({
				min: 68,
				max: 68
			});
		});
	});

	describe('structure — measurement count', () => {
		it('returns null when there are no measurements', () => {
			expect(deriveMeasurementRange([])).toBeNull();
		});

		it('returns a zero-width range for one measurement', () => {
			expect(deriveMeasurementRange([67])).toEqual({
				min: 67,
				max: 67
			});
		});
	});

	describe('structure — null handling', () => {
		it('ignores null and undefined values', () => {
			expect(deriveMeasurementRange([null, 67, undefined, 69])).toEqual({
				min: 67,
				max: 69
			});
		});

		it('returns null when every value is null', () => {
			expect(deriveMeasurementRange([null, undefined])).toBeNull();
		});
	});

	describe('withDominant (wing length)', () => {
		it('attaches a dominant value strictly inside the range', () => {
			// sorted: 67,69,69,69,70 → median 69, majority equal 69
			expect(
				deriveMeasurementRange([67, 70, 69, 69, 69], { withDominant: true })
			).toEqual({ min: 67, max: 70, dominant: 69 });
		});

		it('attaches a dominant value equal to the min endpoint', () => {
			// sorted: 67,67,67,69 → median 67, majority equal 67
			expect(
				deriveMeasurementRange([67, 67, 67, 69], { withDominant: true })
			).toEqual({ min: 67, max: 69, dominant: 67 });
		});

		it('attaches a dominant value equal to the max endpoint', () => {
			// sorted: 67,69,69,69 → median 69, majority equal 69
			expect(
				deriveMeasurementRange([69, 67, 69, 69], { withDominant: true })
			).toEqual({ min: 67, max: 69, dominant: 69 });
		});

		it('omits a dominant value when no value holds the majority', () => {
			// sorted: 67,68,69 → median 68 but only one record equals it
			expect(
				deriveMeasurementRange([67, 68, 69], { withDominant: true })
			).toEqual({ min: 67, max: 69 });
		});

		it('omits a dominant value on an even split with no majority', () => {
			// sorted: 67,67,69,69 → no value is a majority
			expect(
				deriveMeasurementRange([67, 67, 69, 69], { withDominant: true })
			).toEqual({ min: 67, max: 69 });
		});

		it('does not compute a dominant value when withDominant is false', () => {
			expect(deriveMeasurementRange([67, 69, 69, 69])).toEqual({
				min: 67,
				max: 69
			});
		});
	});
});
