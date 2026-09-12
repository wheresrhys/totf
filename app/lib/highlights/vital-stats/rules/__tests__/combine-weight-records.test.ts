import { describe, it, expect } from 'vitest';
import type { WeightRecordHighlight } from '../../types';
import { combineWeightRecords } from '../combine-weight-records';

const weightRecord: WeightRecordHighlight = {
	type: 'weight-record',
	speciesName: 'Blue Tit',
	scope: 'all-time',
	extreme: 'heaviest',
	weight: 13.1,
	placementRank: 1,
	isJointPlacement: false,
	year: 2024,
	isCurrentYear: false
};

describe('combineWeightRecords (Comb-7)', () => {
	// weightRecord is a Blue Tit heaviest all-time 1st; build the pieces from it
	const heaviestThisYear: WeightRecordHighlight = {
		...weightRecord,
		scope: 'this-year'
	};
	const heaviestAllTime2nd: WeightRecordHighlight = {
		...weightRecord,
		scope: 'all-time',
		placementRank: 2
	};
	const heaviestAllTime3rd: WeightRecordHighlight = {
		...weightRecord,
		scope: 'all-time',
		placementRank: 3
	};

	it('merges a this-year 1st with an all-time 2nd for the same species+extreme', () => {
		const combined = combineWeightRecords([
			heaviestAllTime2nd,
			heaviestThisYear
		]);
		expect(combined).toEqual([
			{
				type: 'combined-weight-record',
				speciesName: 'Blue Tit',
				extreme: 'heaviest',
				weight: 13.1,
				year: 2024,
				isCurrentYear: false,
				thisYearIsJoint: false,
				allTimeRank: 2,
				allTimeIsJoint: false
			}
		]);
	});

	it('merges with an all-time 3rd, carrying the rank through', () => {
		const combined = combineWeightRecords([
			heaviestAllTime3rd,
			heaviestThisYear
		]);
		expect(combined).toEqual([
			expect.objectContaining({
				type: 'combined-weight-record',
				allTimeRank: 3
			})
		]);
	});

	it('keeps the all-time line and drops the this-year one when the all-time is a 1st', () => {
		// Being the heaviest ever subsumes the year claim — no combined line
		const combined = combineWeightRecords([weightRecord, heaviestThisYear]);
		expect(combined).toEqual([weightRecord]);
	});

	it('leaves a this-year 1st untouched when the species has no all-time placement', () => {
		expect(combineWeightRecords([heaviestThisYear])).toEqual([
			heaviestThisYear
		]);
	});

	it('matches on extreme — a this-year heaviest is not merged with an all-time lightest', () => {
		const lightestAllTime2nd: WeightRecordHighlight = {
			...weightRecord,
			extreme: 'lightest',
			weight: 9.8,
			placementRank: 2
		};
		const pool = [lightestAllTime2nd, heaviestThisYear];
		expect(combineWeightRecords(pool)).toEqual(pool);
	});

	it('carries the joint flags from each part', () => {
		const combined = combineWeightRecords([
			{ ...heaviestAllTime2nd, isJointPlacement: true },
			{ ...heaviestThisYear, isJointPlacement: true }
		]);
		expect(combined).toEqual([
			expect.objectContaining({
				thisYearIsJoint: true,
				allTimeIsJoint: true,
				allTimeRank: 2
			})
		]);
	});

	it('is a noop when there are no this-year weight records', () => {
		const otherAllTime: WeightRecordHighlight = {
			...weightRecord,
			speciesName: 'Wren',
			extreme: 'lightest',
			weight: 8.2
		};
		const pool = [weightRecord, otherAllTime];
		expect(combineWeightRecords(pool)).toEqual(pool);
	});

	it('does not mutate the input list', () => {
		const pool = [heaviestAllTime2nd, heaviestThisYear];
		const snapshot = [...pool];
		combineWeightRecords(pool);
		expect(pool).toEqual(snapshot);
	});
});
