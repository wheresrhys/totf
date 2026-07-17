import { describe, it, expect } from 'vitest';
import {
	combineHighlights,
	orderByScope,
	removeRedundantHighlights,
	runHighlightMachine
} from '../highlight-refinement-machine';
import type {
	FirstEverSpeciesHighlight,
	FirstOfYearSpeciesHighlight,
	LongAbsenceRetrapHighlight,
	RareSpeciesHighlight,
	SessionHighlight,
	SessionTotalRecordHighlight,
	SinceComparisonHighlight,
	SpeciesCountRecordHighlight,
	WeightRecordHighlight
} from '../session-highlights';

const periodFields = {
	seasonName: 'autumn',
	year: 2024,
	isCurrentYear: false,
	isCurrentSeason: false,
	seasonPeriodLabel: 'autumn 2024'
} as const;

const sessionTotalRecord: SessionTotalRecordHighlight = {
	type: 'session-total-record',
	metric: 'encounters',
	scope: 'all-time',
	value: 74,
	...periodFields
};
const sinceComparison: SinceComparisonHighlight = {
	type: 'since-comparison',
	kind: 'busiest',
	value: 41,
	sinceDate: '2023-05-12'
};
const speciesCountRecord: SpeciesCountRecordHighlight = {
	type: 'species-count-record',
	speciesName: 'Reed Warbler',
	scope: 'all-time',
	value: 12,
	...periodFields
};
const firstEverSpecies: FirstEverSpeciesHighlight = {
	type: 'first-ever-species',
	speciesName: 'Firecrest',
	multipleIndividualsRecorded: false,
	isOnlyRecord: false
};
const firstOfYearSpecies: FirstOfYearSpeciesHighlight = {
	type: 'first-of-year-species',
	speciesName: 'Blackcap',
	year: 2024,
	isCurrentYear: false,
	multipleIndividualsRecorded: false,
	isOnlyRecord: false
};
const rareSpecies: RareSpeciesHighlight = {
	type: 'rare-species',
	speciesName: 'Wryneck',
	totalSessionDays: 2
};
const longAbsenceRetrap: LongAbsenceRetrapHighlight = {
	type: 'long-absence-retrap',
	ringNo: 'ARRETRAP',
	speciesName: 'Robin',
	previousDate: '2021-06-20',
	gapYears: 2,
	gapMonths: 10
};
const weightRecord: WeightRecordHighlight = {
	type: 'weight-record',
	speciesName: 'Blue Tit',
	extreme: 'heaviest',
	weight: 13.1,
	placementRank: 1,
	isJointPlacement: false
};

// Deliberately unsorted pool covering every highlight type
function makeMixedPool(): SessionHighlight[] {
	return [
		weightRecord,
		longAbsenceRetrap,
		rareSpecies,
		firstOfYearSpecies,
		firstEverSpecies,
		speciesCountRecord,
		sinceComparison,
		sessionTotalRecord
	];
}

describe('runHighlightMachine', () => {
	it('returns an empty list for an empty pool', () => {
		expect(runHighlightMachine([])).toEqual([]);
	});

	it('orders a mixed pool of every highlight type by fixed family priority', () => {
		const machined = runHighlightMachine(makeMixedPool());
		expect(machined.map((highlight) => highlight.type)).toEqual([
			'session-total-record',
			'since-comparison',
			'species-count-record',
			'first-ever-species',
			'first-of-year-species',
			'rare-species',
			'long-absence-retrap',
			'weight-record'
		]);
	});

	it('passes the highlight objects through untouched', () => {
		const machined = runHighlightMachine(makeMixedPool());
		expect(machined[0]).toBe(sessionTotalRecord);
		expect(machined.at(-1)).toBe(weightRecord);
	});
});

describe('removeRedundantHighlights', () => {
	// Identity until #360's removal rules land
	it('returns every highlight unchanged', () => {
		const pool = makeMixedPool();
		expect(removeRedundantHighlights(pool)).toEqual(pool);
	});

	it('returns a new list, leaving the input unmutated', () => {
		const pool = makeMixedPool();
		const removed = removeRedundantHighlights(pool);
		expect(removed).not.toBe(pool);
		expect(pool).toEqual(makeMixedPool());
	});
});

describe('orderByScope', () => {
	it('orders highlights by fixed family priority', () => {
		const ordered = orderByScope(makeMixedPool());
		expect(ordered.map((highlight) => highlight.type)).toEqual([
			'session-total-record',
			'since-comparison',
			'species-count-record',
			'first-ever-species',
			'first-of-year-species',
			'rare-species',
			'long-absence-retrap',
			'weight-record'
		]);
	});

	it('preserves generation order within a type', () => {
		const secondRareSpecies: RareSpeciesHighlight = {
			type: 'rare-species',
			speciesName: 'Hoopoe',
			totalSessionDays: 3
		};
		const ordered = orderByScope([
			rareSpecies,
			secondRareSpecies,
			sessionTotalRecord
		]);
		expect(ordered).toEqual([
			sessionTotalRecord,
			rareSpecies,
			secondRareSpecies
		]);
	});

	it('does not mutate the input list', () => {
		const pool = makeMixedPool();
		orderByScope(pool);
		expect(pool).toEqual(makeMixedPool());
	});
});

describe('combineHighlights', () => {
	// Identity until #360's combine rules land
	it('returns every highlight unchanged', () => {
		const pool = makeMixedPool();
		expect(combineHighlights(pool)).toEqual(pool);
	});
});
