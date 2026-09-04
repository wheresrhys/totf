import { describe, it, expect } from 'vitest';
import type { CountHighlight } from '@/app/models/highlights/counts/types';
import type { VitalStatHighlight } from '@/app/models/highlights/vital-stats/types';
import { suppressCountAndWeightHighlightsForRareSpecies } from '../rare-species-suppression';

// #409 defines this logic as the extension point #418 will wire up — see the
// module comment in rare-species-suppression.ts. Nothing in the current tree
// calls it (Rem-3 is unwired), so these tests exercise the function directly
// rather than through any group's pipeline.
const speciesCountRecord: CountHighlight = {
	type: 'species-count-record',
	speciesName: 'Wryneck',
	scope: 'all-time',
	value: 5,
	year: 2024,
	isCurrentYear: false
};
const speciesJuvCountRecord: CountHighlight = {
	type: 'species-juv-count-record',
	speciesName: 'Wryneck',
	scope: 'all-time',
	value: 5,
	year: 2024,
	isCurrentYear: false
};
const sessionTotalRecord: CountHighlight = {
	type: 'session-total-record',
	metric: 'encounters',
	scope: 'all-time',
	value: 74,
	year: 2024,
	isCurrentYear: false
};
const weightRecord: VitalStatHighlight = {
	type: 'weight-record',
	speciesName: 'Wryneck',
	scope: 'all-time',
	extreme: 'heaviest',
	weight: 13.1,
	placementRank: 1,
	isJointPlacement: false,
	year: 2024,
	isCurrentYear: false
};

describe('suppressCountAndWeightHighlightsForRareSpecies', () => {
	it('drops a species-count-record for a rare species', () => {
		const result = suppressCountAndWeightHighlightsForRareSpecies(
			[speciesCountRecord],
			new Set(['Wryneck'])
		);
		expect(result).toEqual([]);
	});

	it('drops a species-juv-count-record and a weight-record for a rare species', () => {
		expect(
			suppressCountAndWeightHighlightsForRareSpecies(
				[speciesJuvCountRecord],
				new Set(['Wryneck'])
			)
		).toEqual([]);
		expect(
			suppressCountAndWeightHighlightsForRareSpecies(
				[weightRecord],
				new Set(['Wryneck'])
			)
		).toEqual([]);
	});

	it('leaves session-wide records untouched, even for a rare species', () => {
		const result = suppressCountAndWeightHighlightsForRareSpecies(
			[sessionTotalRecord],
			new Set(['Wryneck'])
		);
		expect(result).toEqual([sessionTotalRecord]);
	});

	it('leaves another species untouched', () => {
		const result = suppressCountAndWeightHighlightsForRareSpecies(
			[speciesCountRecord],
			new Set(['Wren'])
		);
		expect(result).toEqual([speciesCountRecord]);
	});

	it('is a noop with an empty signal', () => {
		const pool = [speciesCountRecord, weightRecord];
		expect(
			suppressCountAndWeightHighlightsForRareSpecies(pool, new Set())
		).toEqual(pool);
	});
});
