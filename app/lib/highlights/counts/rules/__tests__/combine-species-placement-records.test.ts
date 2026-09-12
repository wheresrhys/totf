import { describe, it, expect } from 'vitest';
import type { SpeciesCountRecordHighlight } from '../../types';
import { combineSpeciesPlacementRecords } from '../combine-species-placement-records';
import { speciesCountRecord, busiestSince } from './fixtures';

describe('combineSpeciesPlacementRecords (Comb-4)', () => {
	// Shorthands for all-time 2nd/3rd best-day placement records
	function secondBest(
		speciesName: string,
		value: number,
		isJointPlacement = false
	): SpeciesCountRecordHighlight {
		return speciesCountRecord(speciesName, 'all-time', value, {
			placementRank: 2,
			isJointPlacement
		});
	}
	function thirdBest(
		speciesName: string,
		value: number
	): SpeciesCountRecordHighlight {
		return speciesCountRecord(speciesName, 'all-time', value, {
			placementRank: 3,
			isJointPlacement: false
		});
	}

	it('leaves a lone placement record unchanged', () => {
		const lone = secondBest('Dunnock', 6);
		expect(combineSpeciesPlacementRecords([lone])).toEqual([lone]);
	});

	it('merges two strict 2nd-best records into a countless line', () => {
		const combined = combineSpeciesPlacementRecords([
			secondBest('Dunnock', 6),
			secondBest('Whitethroat', 6)
		]);
		expect(combined).toEqual([
			{
				type: 'combined-species-placement-record',
				placementRank: 2,
				species: [
					{ name: 'Dunnock', isJoint: false },
					{ name: 'Whitethroat', isJoint: false }
				]
			}
		]);
		// A combined line never carries a count, even when the parts agree on it
		expect(combined[0]).not.toHaveProperty('value');
	});

	it('carries each species joint flag through the merge', () => {
		const combined = combineSpeciesPlacementRecords([
			secondBest('Dunnock', 6, true),
			secondBest('Whitethroat', 6, true)
		]);
		expect(combined).toEqual([
			{
				type: 'combined-species-placement-record',
				placementRank: 2,
				species: [
					{ name: 'Dunnock', isJoint: true },
					{ name: 'Whitethroat', isJoint: true }
				]
			}
		]);
	});

	it('flags each joint species in a mixed group, still without a count', () => {
		const combined = combineSpeciesPlacementRecords([
			secondBest('Dunnock', 6, false),
			secondBest('Whitethroat', 6, true)
		]);
		expect(combined).toEqual([
			expect.objectContaining({
				type: 'combined-species-placement-record',
				placementRank: 2,
				species: [
					{ name: 'Dunnock', isJoint: false },
					{ name: 'Whitethroat', isJoint: true }
				]
			})
		]);
		expect(combined[0]).not.toHaveProperty('value');
	});

	it('drops the count even when merged placements disagree on it', () => {
		const combined = combineSpeciesPlacementRecords([
			secondBest('Dunnock', 6),
			secondBest('Blue Tit', 15)
		]);
		expect(combined).toEqual([
			expect.objectContaining({
				type: 'combined-species-placement-record',
				species: [
					{ name: 'Dunnock', isJoint: false },
					{ name: 'Blue Tit', isJoint: false }
				]
			})
		]);
		expect(combined[0]).not.toHaveProperty('value');
	});

	it('merges 2nd- and 3rd-best records into separate lines', () => {
		const combined = combineSpeciesPlacementRecords([
			secondBest('Dunnock', 6),
			secondBest('Whitethroat', 6),
			thirdBest('Wren', 4),
			thirdBest('Robin', 4)
		]);
		expect(
			combined.map((highlight) =>
				highlight.type === 'combined-species-placement-record'
					? [highlight.type, highlight.placementRank]
					: [highlight.type]
			)
		).toEqual([
			['combined-species-placement-record', 2],
			['combined-species-placement-record', 3]
		]);
	});

	it('lists three merged species in source order', () => {
		const combined = combineSpeciesPlacementRecords([
			secondBest('Dunnock', 6),
			secondBest('Whitethroat', 6),
			secondBest('Blackcap', 6)
		]);
		expect(combined).toEqual([
			expect.objectContaining({
				species: [
					{ name: 'Dunnock', isJoint: false },
					{ name: 'Whitethroat', isJoint: false },
					{ name: 'Blackcap', isJoint: false }
				]
			})
		]);
	});

	it('takes the list position of the first record of its rank', () => {
		const combined = combineSpeciesPlacementRecords([
			secondBest('Dunnock', 6),
			busiestSince,
			secondBest('Whitethroat', 6)
		]);
		expect(combined.map((highlight) => highlight.type)).toEqual([
			'combined-species-placement-record',
			'since-comparison'
		]);
	});

	it('never merges strict records, this-year records or record-equalling ties', () => {
		const strictRecord = speciesCountRecord('Reed Warbler', 'all-time', 30);
		const thisYear = speciesCountRecord('Chiffchaff', 'this-year', 5);
		const jointFirst = speciesCountRecord('Blackcap', 'all-time', 24, {
			placementRank: 1,
			isJointPlacement: true
		});
		const pool = [strictRecord, thisYear, jointFirst];
		expect(combineSpeciesPlacementRecords(pool)).toEqual(pool);
	});

	it('is a noop on unrelated highlights', () => {
		const pool = [busiestSince, speciesCountRecord('Wren', 'all-time', 3)];
		expect(combineSpeciesPlacementRecords(pool)).toEqual(pool);
	});

	it('does not mutate the input list', () => {
		const pool = [secondBest('Dunnock', 6), secondBest('Whitethroat', 6)];
		const snapshot = [...pool];
		combineSpeciesPlacementRecords(pool);
		expect(pool).toEqual(snapshot);
	});
});
