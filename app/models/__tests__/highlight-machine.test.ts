import { describe, it, expect } from 'vitest';
import {
	combineHighlights,
	orderByScope,
	removeRedundantHighlights,
	runHighlightMachine,
	type HighlightPrinter
} from '../highlight-machine';
import {
	FirstEverSpeciesHighlight,
	FirstOfYearSpeciesHighlight,
	LongAbsenceRetrapHighlight,
	RareSpeciesHighlight,
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

const sessionTotalRecord = new SessionTotalRecordHighlight({
	metric: 'encounters',
	scope: 'all-time',
	value: 74,
	...periodFields
});
const sinceComparison = new SinceComparisonHighlight({
	kind: 'busiest',
	value: 41,
	sinceDate: '2023-05-12'
});
const speciesCountRecord = new SpeciesCountRecordHighlight({
	speciesName: 'Reed Warbler',
	scope: 'all-time',
	value: 12,
	...periodFields
});
const firstEverSpecies = new FirstEverSpeciesHighlight({
	speciesName: 'Firecrest',
	multipleIndividualsRecorded: false,
	isOnlyRecord: false
});
const firstOfYearSpecies = new FirstOfYearSpeciesHighlight({
	speciesName: 'Blackcap',
	year: 2024,
	isCurrentYear: false,
	multipleIndividualsRecorded: false,
	isOnlyRecord: false
});
const rareSpecies = new RareSpeciesHighlight({
	speciesName: 'Wryneck',
	totalSessionDays: 2
});
const longAbsenceRetrap = new LongAbsenceRetrapHighlight({
	ringNo: 'ARRETRAP',
	speciesName: 'Robin',
	previousDate: '2021-06-20',
	gapYears: 2,
	gapMonths: 10
});
const weightRecord = new WeightRecordHighlight({
	speciesName: 'Blue Tit',
	extreme: 'heaviest',
	weight: 13.1,
	placementRank: 1,
	isJointPlacement: false
});

// Deliberately unsorted pool covering every highlight type
function makeMixedPool(): HighlightPrinter[] {
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

	it('passes the highlight instances through untouched', () => {
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
		const secondRareSpecies = new RareSpeciesHighlight({
			speciesName: 'Hoopoe',
			totalSessionDays: 3
		});
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
