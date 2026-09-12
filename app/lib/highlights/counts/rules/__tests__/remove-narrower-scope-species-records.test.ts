import { describe, it, expect } from 'vitest';
import { removeNarrowerScopeSpeciesRecords } from '../remove-narrower-scope-species-records';
import {
	sessionTotalRecord,
	speciesCountRecord,
	speciesJuvCountRecord,
	busiestSince
} from './fixtures';

describe('removeNarrowerScopeSpeciesRecords (Rem-2)', () => {
	it('drops a this-year species record when the species holds an all-time record', () => {
		const removed = removeNarrowerScopeSpeciesRecords([
			speciesCountRecord('Reed Warbler', 'all-time', 67, {
				placementRank: 2,
				isJointPlacement: false
			}),
			speciesCountRecord('Reed Warbler', 'this-year', 67)
		]);
		expect(removed).toEqual([
			speciesCountRecord('Reed Warbler', 'all-time', 67, {
				placementRank: 2,
				isJointPlacement: false
			})
		]);
	});

	it('keeps records for different species at their own broadest scope', () => {
		const blueTit = speciesCountRecord('Blue Tit', 'this-year', 5);
		const wren = speciesCountRecord('Wren', 'all-time', 3);
		const removed = removeNarrowerScopeSpeciesRecords([blueTit, wren]);
		expect(removed).toEqual([blueTit, wren]);
	});

	it('keeps the broadest scope for one species', () => {
		const allTime = speciesCountRecord('Blackcap', 'all-time', 24);
		const removed = removeNarrowerScopeSpeciesRecords([
			speciesCountRecord('Blackcap', 'this-year', 24),
			allTime
		]);
		expect(removed).toEqual([allTime]);
	});

	it('drops a this-year juv record when the species holds an all-time juv record', () => {
		const allTime = speciesJuvCountRecord('Reed Warbler', 'all-time', 12);
		const removed = removeNarrowerScopeSpeciesRecords([
			allTime,
			speciesJuvCountRecord('Reed Warbler', 'this-year', 12)
		]);
		expect(removed).toEqual([allTime]);
	});

	it('keeps an encounter record and a juv record for the same species', () => {
		// The two families are deduped independently — a species can hold one of
		// each, so neither collapses the other
		const encounterRecord = speciesCountRecord('Reed Warbler', 'all-time', 30);
		const juvRecord = speciesJuvCountRecord('Reed Warbler', 'all-time', 12);
		const removed = removeNarrowerScopeSpeciesRecords([
			encounterRecord,
			juvRecord
		]);
		expect(removed).toEqual([encounterRecord, juvRecord]);
	});

	it('is a noop on non-species-record highlights', () => {
		// Weight records now live in the Vital-stats group entirely — this rule's
		// type (CountHighlight[]) can no longer even accept one, so the old
		// "leaves weight records untouched" case is now structurally guaranteed
		// rather than behaviour to test here.
		const pool = [
			busiestSince,
			sessionTotalRecord('encounters', 'this-year', 50)
		];
		expect(removeNarrowerScopeSpeciesRecords(pool)).toEqual(pool);
	});
});
