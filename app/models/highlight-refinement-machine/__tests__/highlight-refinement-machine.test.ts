import { describe, it, expect } from 'vitest';
import {
	combineFirstEverHighlights,
	combineFirstOfYearHighlights,
	combineOnlyOfYearHighlights,
	combineSessionTotalRecords,
	combineYearSpeciesCounts,
	orderBySortValue,
	removeBusiestSinceWhenBusiestRecordHeld,
	removeNarrowerScopeSpeciesRecords,
	runHighlightMachine
} from '..';
import {
	combinedSortValue,
	familySortValue,
	juvSortValue,
	scopedSortValue,
	type FirstEverSpeciesHighlight,
	type FirstOfYearSpeciesHighlight,
	type LongAbsenceRetrapHighlight,
	type RareSpeciesHighlight,
	type RecordScope,
	type SessionHighlight,
	type SessionTotalMetric,
	type SessionTotalRecordHighlight,
	type SinceComparisonHighlight,
	type SpeciesCountRecordHighlight,
	type SpeciesJuvCountRecordHighlight,
	type WeightRecordHighlight
} from '@/app/models/session-highlights';

const periodFields = {
	year: 2026,
	isCurrentYear: true
} as const;

function sessionTotalRecord(
	metric: SessionTotalMetric,
	scope: RecordScope,
	value: number
): SessionTotalRecordHighlight {
	return {
		type: 'session-total-record',
		sortValue: scopedSortValue(scope, metric === 'encounters' ? 3 : 2),
		metric,
		scope,
		value,
		...periodFields
	};
}

function speciesCountRecord(
	speciesName: string,
	scope: RecordScope,
	value: number,
	extra: Partial<SpeciesCountRecordHighlight> = {}
): SpeciesCountRecordHighlight {
	return {
		type: 'species-count-record',
		sortValue: scopedSortValue(scope, 1),
		speciesName,
		scope,
		value,
		...periodFields,
		...extra
	};
}

function speciesJuvCountRecord(
	speciesName: string,
	scope: RecordScope,
	value: number,
	extra: Partial<SpeciesJuvCountRecordHighlight> = {}
): SpeciesJuvCountRecordHighlight {
	return {
		type: 'species-juv-count-record',
		sortValue: juvSortValue('juv-species-count', scope),
		speciesName,
		scope,
		value,
		...periodFields,
		...extra
	};
}

function firstOfYear(
	speciesName: string,
	isOnlyRecord: boolean,
	multipleIndividualsRecorded = false
): FirstOfYearSpeciesHighlight {
	return {
		type: 'first-of-year-species',
		sortValue: familySortValue('first-of-year-species'),
		speciesName,
		year: 2026,
		isCurrentYear: true,
		multipleIndividualsRecorded,
		isOnlyRecord
	};
}

function firstEver(
	speciesName: string,
	isOnlyRecord: boolean,
	multipleIndividualsRecorded = false
): FirstEverSpeciesHighlight {
	return {
		type: 'first-ever-species',
		sortValue: familySortValue(
			isOnlyRecord ? 'only-ever-species' : 'first-ever-species'
		),
		speciesName,
		multipleIndividualsRecorded,
		isOnlyRecord
	};
}

const busiestSince: SinceComparisonHighlight = {
	type: 'since-comparison',
	sortValue: familySortValue('since-comparison'),
	kind: 'busiest',
	value: 120,
	sinceDate: '2025-09-06'
};
const quietestSince: SinceComparisonHighlight = {
	type: 'since-comparison',
	sortValue: familySortValue('since-comparison'),
	kind: 'quietest',
	value: 3,
	sinceDate: '2023-09-14'
};
const firstEverSpecies: FirstEverSpeciesHighlight = {
	type: 'first-ever-species',
	sortValue: familySortValue('first-ever-species'),
	speciesName: 'Firecrest',
	multipleIndividualsRecorded: false,
	isOnlyRecord: false
};
const rareSpecies: RareSpeciesHighlight = {
	type: 'rare-species',
	sortValue: familySortValue('rare-species'),
	speciesName: 'Wryneck',
	totalSessionDays: 2
};
const longAbsenceRetrap: LongAbsenceRetrapHighlight = {
	type: 'long-absence-retrap',
	sortValue: familySortValue('long-absence-retrap'),
	ringNo: 'ARRETRAP',
	speciesName: 'Robin',
	previousDate: '2021-06-20',
	gapYears: 2,
	gapMonths: 10
};
const weightRecord: WeightRecordHighlight = {
	type: 'weight-record',
	sortValue: familySortValue('weight-record'),
	speciesName: 'Blue Tit',
	extreme: 'heaviest',
	weight: 13.1,
	placementRank: 1,
	isJointPlacement: false
};

// ---- Removal rules ----

describe('removeBusiestSinceWhenBusiestRecordHeld (Rem-1)', () => {
	it('drops a busiest-since comparison when a busiest session-total record is present', () => {
		const removed = removeBusiestSinceWhenBusiestRecordHeld([
			sessionTotalRecord('encounters', 'this-year', 120),
			busiestSince
		]);
		expect(removed).toEqual([
			sessionTotalRecord('encounters', 'this-year', 120)
		]);
	});

	it('keeps a busiest-since comparison when no busiest record is present', () => {
		const removed = removeBusiestSinceWhenBusiestRecordHeld([
			sessionTotalRecord('species', 'this-year', 15),
			busiestSince
		]);
		expect(removed).toContainEqual(busiestSince);
	});

	it('never drops a quietest-since comparison', () => {
		const removed = removeBusiestSinceWhenBusiestRecordHeld([
			sessionTotalRecord('encounters', 'this-year', 120),
			quietestSince
		]);
		expect(removed).toContainEqual(quietestSince);
	});

	it('is a noop on unrelated highlights', () => {
		const pool = [rareSpecies, weightRecord];
		expect(removeBusiestSinceWhenBusiestRecordHeld(pool)).toEqual(pool);
	});

	it('does not mutate the input list', () => {
		const pool = [
			sessionTotalRecord('encounters', 'this-year', 120),
			busiestSince
		];
		const snapshot = [...pool];
		removeBusiestSinceWhenBusiestRecordHeld(pool);
		expect(pool).toEqual(snapshot);
	});
});

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
		const pool = [busiestSince, weightRecord];
		expect(removeNarrowerScopeSpeciesRecords(pool)).toEqual(pool);
	});
});

// ---- Ordering (the machine's final rule, run after combining) ----

describe('orderBySortValue (Ord-1)', () => {
	it('orders scoped records by descending sort value (temporal + conceptual)', () => {
		const ordered = orderBySortValue([
			speciesCountRecord('Reed Warbler', 'all-time', 67, {
				placementRank: 2,
				isJointPlacement: false
			}), // 3.01
			sessionTotalRecord('species', 'this-year', 15), // most varied 3.02
			speciesCountRecord('Chiffchaff', 'this-year', 3), // 2.01
			sessionTotalRecord('encounters', 'this-year', 120) // busiest 4.03
		]);
		expect(ordered.map((highlight) => highlight.sortValue)).toEqual([
			scopedSortValue('this-year', 3),
			scopedSortValue('this-year', 2),
			scopedSortValue('all-time', 1),
			scopedSortValue('this-year', 1)
		]);
	});

	it('breaks an equal-sum tie in favour of session measures', () => {
		// busiest this-year (2 + 3) and an all-time single-species record (4 + 1)
		// both sum to 5; the session measure wins on the conceptual tiebreak
		const busiestThisYear = sessionTotalRecord('encounters', 'this-year', 120);
		const allTimeSpecies = speciesCountRecord('Reed Warbler', 'all-time', 67, {
			placementRank: 2,
			isJointPlacement: false
		});
		const ordered = orderBySortValue([allTimeSpecies, busiestThisYear]);
		expect(ordered).toEqual([busiestThisYear, allTimeSpecies]);
	});

	it('places a combined session-total record above the records it outranks', () => {
		const combined: SessionHighlight = {
			type: 'combined-session-total-record',
			sortValue: combinedSortValue([
				sessionTotalRecord('encounters', 'this-year', 120),
				sessionTotalRecord('species', 'this-year', 15)
			]),
			scope: 'this-year',
			encounterValue: 120,
			speciesValue: 15,
			...periodFields
		};
		const ordered = orderBySortValue([
			speciesCountRecord('Reed Warbler', 'all-time', 67, {
				placementRank: 2,
				isJointPlacement: false
			}),
			combined,
			speciesCountRecord('Chiffchaff', 'this-year', 3)
		]);
		expect(ordered.map((highlight) => highlight.type)).toEqual([
			'combined-session-total-record',
			'species-count-record',
			'species-count-record'
		]);
		expect(ordered[0]).toBe(combined);
	});

	it('promotes only-ever, first-ever, rare and long-absence above the record block, weights last', () => {
		const onlyEverSpecies = firstEver('Hoopoe', true);
		const ordered = orderBySortValue([
			weightRecord,
			longAbsenceRetrap,
			rareSpecies,
			firstEverSpecies,
			onlyEverSpecies,
			quietestSince,
			speciesCountRecord('Reed Warbler', 'all-time', 67, {
				placementRank: 2,
				isJointPlacement: false
			})
		]);
		expect(ordered.map((highlight) => highlight.type)).toEqual([
			// only-ever heads the list, then first-ever, rare and long-absence,
			// all above the scoped record block and the trailing since/weight lines
			'first-ever-species', // Hoopoe — only-ever, top priority
			'first-ever-species', // Firecrest — plain first-ever
			'rare-species',
			'long-absence-retrap',
			'species-count-record',
			'since-comparison',
			'weight-record'
		]);
		// the only-ever record is first, ahead of the plain first-ever
		expect(ordered[0]).toBe(onlyEverSpecies);
	});

	it('preserves generation order within an equal sort value', () => {
		const blueTit = speciesCountRecord('Blue Tit', 'this-year', 5);
		const cettis = speciesCountRecord("Cetti's Warbler", 'this-year', 5);
		const dunnock = speciesCountRecord('Dunnock', 'this-year', 4);
		const ordered = orderBySortValue([blueTit, cettis, dunnock]);
		expect(ordered).toEqual([blueTit, cettis, dunnock]);
	});

	it('does not mutate the input list', () => {
		const pool = [
			rareSpecies,
			sessionTotalRecord('encounters', 'all-time', 74)
		];
		const snapshot = [...pool];
		orderBySortValue(pool);
		expect(pool).toEqual(snapshot);
	});
});

// ---- Combining rules ----

describe('combineSessionTotalRecords (Comb-1)', () => {
	it('merges same-scope encounters and species records into one combined record', () => {
		const combined = combineSessionTotalRecords([
			sessionTotalRecord('encounters', 'this-year', 120),
			sessionTotalRecord('species', 'this-year', 15)
		]);
		expect(combined).toEqual([
			{
				type: 'combined-session-total-record',
				sortValue: combinedSortValue([
					sessionTotalRecord('encounters', 'this-year', 120),
					sessionTotalRecord('species', 'this-year', 15)
				]),
				scope: 'this-year',
				encounterValue: 120,
				speciesValue: 15,
				...periodFields
			}
		]);
	});

	it('leaves records over different scopes separate', () => {
		const encounters = sessionTotalRecord('encounters', 'all-time', 200);
		const species = sessionTotalRecord('species', 'this-year', 15);
		const combined = combineSessionTotalRecords([encounters, species]);
		expect(combined).toEqual([encounters, species]);
	});

	it('takes the list position of the encounters record', () => {
		const combined = combineSessionTotalRecords([
			sessionTotalRecord('species', 'this-year', 15),
			sessionTotalRecord('encounters', 'this-year', 120)
		]);
		expect(combined).toHaveLength(1);
		expect(combined[0].type).toBe('combined-session-total-record');
	});

	it('leaves a lone session-total record unchanged', () => {
		const lone = sessionTotalRecord('encounters', 'this-year', 120);
		expect(combineSessionTotalRecords([lone])).toEqual([lone]);
	});
});

describe('combineOnlyOfYearHighlights (Comb-2)', () => {
	it('leaves a single only-of-year highlight unchanged', () => {
		const only = firstOfYear('Chaffinch', true);
		expect(combineOnlyOfYearHighlights([only])).toEqual([only]);
	});

	it('merges two only-of-year highlights into one line listing both species', () => {
		const combined = combineOnlyOfYearHighlights([
			firstOfYear('Chaffinch', true),
			firstOfYear('Goldfinch', true)
		]);
		expect(combined).toEqual([
			{
				type: 'combined-only-of-year',
				sortValue: combinedSortValue([
					firstOfYear('Chaffinch', true),
					firstOfYear('Goldfinch', true)
				]),
				speciesNames: ['Chaffinch', 'Goldfinch'],
				year: 2026,
				isCurrentYear: true
			}
		]);
	});

	it('merges three only-of-year highlights into one line listing all species', () => {
		const combined = combineOnlyOfYearHighlights([
			firstOfYear('Chaffinch', true),
			firstOfYear('Goldfinch', true),
			firstOfYear('Lesser Whitethroat', true)
		]);
		expect(combined).toEqual([
			{
				type: 'combined-only-of-year',
				sortValue: combinedSortValue([
					firstOfYear('Chaffinch', true),
					firstOfYear('Goldfinch', true),
					firstOfYear('Lesser Whitethroat', true)
				]),
				speciesNames: ['Chaffinch', 'Goldfinch', 'Lesser Whitethroat'],
				year: 2026,
				isCurrentYear: true
			}
		]);
	});

	it('does not merge first-of-year (non-only) highlights', () => {
		const first = firstOfYear('Chaffinch', false);
		const secondFirst = firstOfYear('Goldfinch', false);
		expect(combineOnlyOfYearHighlights([first, secondFirst])).toEqual([
			first,
			secondFirst
		]);
	});

	it('merges only onlys, leaving first-of-year items in place', () => {
		const firstA = firstOfYear('Robin', false);
		const combined = combineOnlyOfYearHighlights([
			firstA,
			firstOfYear('Chaffinch', true),
			firstOfYear('Goldfinch', true)
		]);
		expect(combined).toEqual([
			firstA,
			{
				type: 'combined-only-of-year',
				sortValue: combinedSortValue([
					firstOfYear('Chaffinch', true),
					firstOfYear('Goldfinch', true)
				]),
				speciesNames: ['Chaffinch', 'Goldfinch'],
				year: 2026,
				isCurrentYear: true
			}
		]);
	});

	it('is a noop on unrelated highlights', () => {
		const pool = [rareSpecies, weightRecord];
		expect(combineOnlyOfYearHighlights(pool)).toEqual(pool);
	});
});

describe('combineYearSpeciesCounts (Comb-3)', () => {
	it('leaves a single this-year species record unchanged', () => {
		const lone = speciesCountRecord('Chiffchaff', 'this-year', 5);
		expect(combineYearSpeciesCounts([lone])).toEqual([lone]);
	});

	it('merges multiple this-year records into one line dropping the counts', () => {
		const combined = combineYearSpeciesCounts([
			speciesCountRecord("Cetti's Warbler", 'this-year', 6),
			speciesCountRecord('Chiffchaff', 'this-year', 5),
			speciesCountRecord('Whitethroat', 'this-year', 4)
		]);
		expect(combined).toEqual([
			{
				type: 'combined-species-count-record',
				sortValue: combinedSortValue([
					speciesCountRecord("Cetti's Warbler", 'this-year', 6),
					speciesCountRecord('Chiffchaff', 'this-year', 5),
					speciesCountRecord('Whitethroat', 'this-year', 4)
				]),
				scope: 'this-year',
				speciesNames: ["Cetti's Warbler", 'Chiffchaff', 'Whitethroat'],
				...periodFields
			}
		]);
	});

	it('takes the list position of the first this-year record', () => {
		const combined = combineYearSpeciesCounts([
			speciesCountRecord("Cetti's Warbler", 'this-year', 6),
			speciesCountRecord('Blackcap', 'all-time', 24),
			speciesCountRecord('Chiffchaff', 'this-year', 5)
		]);
		expect(combined.map((highlight) => highlight.type)).toEqual([
			'combined-species-count-record',
			'species-count-record'
		]);
	});

	it('never merges all-time records', () => {
		const allTime = speciesCountRecord('Reed Warbler', 'all-time', 67, {
			placementRank: 2,
			isJointPlacement: false
		});
		const anotherAllTime = speciesCountRecord('Blackcap', 'all-time', 24);
		expect(combineYearSpeciesCounts([allTime, anotherAllTime])).toEqual([
			allTime,
			anotherAllTime
		]);
	});

	it('leaves a lone this-year record alongside an all-time record unchanged', () => {
		const year = speciesCountRecord('Chiffchaff', 'this-year', 5);
		const allTime = speciesCountRecord('Wren', 'all-time', 3);
		expect(combineYearSpeciesCounts([year, allTime])).toEqual([year, allTime]);
	});

	it('is a noop on unrelated highlights', () => {
		const pool = [rareSpecies, weightRecord];
		expect(combineYearSpeciesCounts(pool)).toEqual(pool);
	});
});

describe('combineFirstEverHighlights (Comb-4)', () => {
	it('leaves a single first-ever highlight unchanged', () => {
		const only = firstEver('Firecrest', false);
		expect(combineFirstEverHighlights([only])).toEqual([only]);
	});

	it('merges two first-ever highlights into one line listing both species', () => {
		const combined = combineFirstEverHighlights([
			firstEver('Blackbird', false),
			firstEver('Blackcap', false)
		]);
		expect(combined).toEqual([
			{
				type: 'combined-first-ever',
				sortValue: combinedSortValue([
					firstEver('Blackbird', false),
					firstEver('Blackcap', false)
				]),
				speciesNames: ['Blackbird', 'Blackcap']
			}
		]);
	});

	it('merges three first-ever highlights into one line listing all species', () => {
		const combined = combineFirstEverHighlights([
			firstEver('Blackbird', false),
			firstEver('Blackcap', false),
			firstEver("Cetti's Warbler", false)
		]);
		expect(combined).toEqual([
			{
				type: 'combined-first-ever',
				sortValue: combinedSortValue([
					firstEver('Blackbird', false),
					firstEver('Blackcap', false),
					firstEver("Cetti's Warbler", false)
				]),
				speciesNames: ['Blackbird', 'Blackcap', "Cetti's Warbler"]
			}
		]);
	});

	it('merges regardless of each part being singular or plural', () => {
		const combined = combineFirstEverHighlights([
			firstEver('Blackbird', false, false),
			firstEver('Blackcap', false, true)
		]);
		expect(combined).toEqual([
			expect.objectContaining({
				type: 'combined-first-ever',
				speciesNames: ['Blackbird', 'Blackcap']
			})
		]);
	});

	it('never merges "Only ... ever" (isOnlyRecord) highlights', () => {
		const firstA = firstEver('Robin', true);
		const firstB = firstEver('Wren', true);
		expect(combineFirstEverHighlights([firstA, firstB])).toEqual([
			firstA,
			firstB
		]);
	});

	it('merges only the first-ever items, leaving "only ever" items in place', () => {
		const onlyEver = firstEver('Robin', true);
		const combined = combineFirstEverHighlights([
			onlyEver,
			firstEver('Blackbird', false),
			firstEver('Blackcap', false)
		]);
		expect(combined).toEqual([
			onlyEver,
			{
				type: 'combined-first-ever',
				sortValue: combinedSortValue([
					firstEver('Blackbird', false),
					firstEver('Blackcap', false)
				]),
				speciesNames: ['Blackbird', 'Blackcap']
			}
		]);
	});

	it('takes the list position of the first first-ever highlight', () => {
		const combined = combineFirstEverHighlights([
			firstEver('Blackbird', false),
			rareSpecies,
			firstEver('Blackcap', false)
		]);
		expect(combined.map((highlight) => highlight.type)).toEqual([
			'combined-first-ever',
			'rare-species'
		]);
	});

	it('is a noop on unrelated highlights', () => {
		const pool = [rareSpecies, weightRecord];
		expect(combineFirstEverHighlights(pool)).toEqual(pool);
	});
});

describe('combineFirstOfYearHighlights (Comb-5)', () => {
	it('leaves a single first-of-year highlight unchanged', () => {
		const only = firstOfYear('Robin', false);
		expect(combineFirstOfYearHighlights([only])).toEqual([only]);
	});

	it('merges two first-of-year highlights into one line listing both species', () => {
		const combined = combineFirstOfYearHighlights([
			firstOfYear('Blackbird', false),
			firstOfYear('Blackcap', false)
		]);
		expect(combined).toEqual([
			{
				type: 'combined-first-of-year',
				sortValue: combinedSortValue([
					firstOfYear('Blackbird', false),
					firstOfYear('Blackcap', false)
				]),
				speciesNames: ['Blackbird', 'Blackcap'],
				year: 2026,
				isCurrentYear: true
			}
		]);
	});

	it('merges three first-of-year highlights into one line listing all species', () => {
		const combined = combineFirstOfYearHighlights([
			firstOfYear('Blackbird', false),
			firstOfYear('Blackcap', false),
			firstOfYear("Cetti's Warbler", false)
		]);
		expect(combined).toEqual([
			{
				type: 'combined-first-of-year',
				sortValue: combinedSortValue([
					firstOfYear('Blackbird', false),
					firstOfYear('Blackcap', false),
					firstOfYear("Cetti's Warbler", false)
				]),
				speciesNames: ['Blackbird', 'Blackcap', "Cetti's Warbler"],
				year: 2026,
				isCurrentYear: true
			}
		]);
	});

	it('merges regardless of each part being singular or plural', () => {
		const combined = combineFirstOfYearHighlights([
			firstOfYear('Blackbird', false, false),
			firstOfYear('Blackcap', false, true)
		]);
		expect(combined).toEqual([
			expect.objectContaining({
				type: 'combined-first-of-year',
				speciesNames: ['Blackbird', 'Blackcap']
			})
		]);
	});

	it('never merges "Only ... of the year" (isOnlyRecord) highlights', () => {
		const onlyA = firstOfYear('Chaffinch', true);
		const onlyB = firstOfYear('Goldfinch', true);
		expect(combineFirstOfYearHighlights([onlyA, onlyB])).toEqual([
			onlyA,
			onlyB
		]);
	});

	it('merges only the first-of-year items, leaving "only of year" items in place', () => {
		const onlyOfYear = firstOfYear('Chaffinch', true);
		const combined = combineFirstOfYearHighlights([
			onlyOfYear,
			firstOfYear('Blackbird', false),
			firstOfYear('Blackcap', false)
		]);
		expect(combined).toEqual([
			onlyOfYear,
			{
				type: 'combined-first-of-year',
				sortValue: combinedSortValue([
					firstOfYear('Blackbird', false),
					firstOfYear('Blackcap', false)
				]),
				speciesNames: ['Blackbird', 'Blackcap'],
				year: 2026,
				isCurrentYear: true
			}
		]);
	});

	it('is a noop on unrelated highlights', () => {
		const pool = [rareSpecies, weightRecord];
		expect(combineFirstOfYearHighlights(pool)).toEqual(pool);
	});
});

// ---- Full machine ----

describe('runHighlightMachine', () => {
	it('returns an empty list for an empty pool', () => {
		expect(runHighlightMachine([])).toEqual([]);
	});

	// The #360 example session /group/1/session/2026-06-20, exercising every rule
	it('produces the refined #360 example ordering end to end', () => {
		const pool: SessionHighlight[] = [
			// unsorted, as derived
			speciesCountRecord('Blue Tit', 'this-year', 5),
			speciesCountRecord("Cetti's Warbler", 'this-year', 5),
			speciesCountRecord('Dunnock', 'this-year', 4),
			speciesCountRecord('Reed Warbler', 'this-year', 67),
			speciesCountRecord('Wren', 'this-year', 3),
			speciesCountRecord('Reed Warbler', 'all-time', 67, {
				placementRank: 2,
				isJointPlacement: false
			}),
			sessionTotalRecord('encounters', 'this-year', 120),
			sessionTotalRecord('species', 'this-year', 15),
			busiestSince,
			firstOfYear('Chaffinch', true),
			firstOfYear('Goldfinch', true),
			firstOfYear('Lesser Whitethroat', true),
			weightRecord
		];
		const machined = runHighlightMachine(pool);
		expect(
			machined.map((highlight) => [
				highlight.type,
				'speciesName' in highlight
					? highlight.speciesName
					: 'speciesNames' in highlight
						? highlight.speciesNames.join('+')
						: highlight.type
			])
		).toEqual([
			// the combined busiest/most-varied line for this-year heads the list,
			// above the all-time single-species record
			['combined-session-total-record', 'combined-session-total-record'],
			['species-count-record', 'Reed Warbler'], // all-time placement
			// the four surviving this-year single-species records fold into one
			// line; Reed Warbler's this-year record was already dropped by Rem-2
			// in favour of its all-time placement
			[
				'combined-species-count-record',
				"Blue Tit+Cetti's Warbler+Dunnock+Wren"
			],
			['combined-only-of-year', 'Chaffinch+Goldfinch+Lesser Whitethroat'], // 0.8
			['weight-record', 'Blue Tit'] // 0.0
		]);
	});

	it('folds first-ever and first-of-year highlights into their own combined lines', () => {
		const pool: SessionHighlight[] = [
			firstEver('Blackbird', false),
			firstEver('Blackcap', false),
			firstEver("Cetti's Warbler", false),
			firstOfYear('Chiffchaff', false),
			firstOfYear('Whitethroat', false),
			weightRecord
		];
		const machined = runHighlightMachine(pool);
		expect(
			machined.map((highlight) =>
				'speciesNames' in highlight
					? [highlight.type, highlight.speciesNames.join('+')]
					: [highlight.type]
			)
		).toEqual([
			// first-ever (0.8 + 0.2 = 1.0) above first-of-year (0.6 + 0.1 = 0.7)
			['combined-first-ever', "Blackbird+Blackcap+Cetti's Warbler"],
			['combined-first-of-year', 'Chiffchaff+Whitethroat'],
			['weight-record']
		]);
	});
});
