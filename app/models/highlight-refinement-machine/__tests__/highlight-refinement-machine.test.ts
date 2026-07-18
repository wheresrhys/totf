import { describe, it, expect } from 'vitest';
import {
	combineOnlyOfYearHighlights,
	combineSessionTotalRecords,
	combineYearAndSeasonSpeciesCounts,
	orderBySortValue,
	removeBusiestSinceWhenBusiestRecordHeld,
	removeNarrowerScopeSpeciesRecords,
	runHighlightMachine
} from '..';
import {
	combinedSortValue,
	scopedSortValue,
	TRAILING_SORT_VALUES,
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
	type WeightRecordHighlight
} from '@/app/models/session-highlights';

const periodFields = {
	seasonName: 'spring',
	year: 2026,
	isCurrentYear: true,
	isCurrentSeason: true,
	seasonPeriodLabel: 'spring 2026'
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

function firstOfYear(
	speciesName: string,
	isOnlyRecord: boolean
): FirstOfYearSpeciesHighlight {
	return {
		type: 'first-of-year-species',
		sortValue: TRAILING_SORT_VALUES['first-of-year-species'],
		speciesName,
		year: 2026,
		isCurrentYear: true,
		multipleIndividualsRecorded: false,
		isOnlyRecord
	};
}

const busiestSince: SinceComparisonHighlight = {
	type: 'since-comparison',
	sortValue: TRAILING_SORT_VALUES['since-comparison'],
	kind: 'busiest',
	value: 120,
	sinceDate: '2025-09-06'
};
const quietestSince: SinceComparisonHighlight = {
	type: 'since-comparison',
	sortValue: TRAILING_SORT_VALUES['since-comparison'],
	kind: 'quietest',
	value: 3,
	sinceDate: '2023-09-14'
};
const firstEverSpecies: FirstEverSpeciesHighlight = {
	type: 'first-ever-species',
	sortValue: TRAILING_SORT_VALUES['first-ever-species'],
	speciesName: 'Firecrest',
	multipleIndividualsRecorded: false,
	isOnlyRecord: false
};
const rareSpecies: RareSpeciesHighlight = {
	type: 'rare-species',
	sortValue: TRAILING_SORT_VALUES['rare-species'],
	speciesName: 'Wryneck',
	totalSessionDays: 2
};
const longAbsenceRetrap: LongAbsenceRetrapHighlight = {
	type: 'long-absence-retrap',
	sortValue: TRAILING_SORT_VALUES['long-absence-retrap'],
	ringNo: 'ARRETRAP',
	speciesName: 'Robin',
	previousDate: '2021-06-20',
	gapYears: 2,
	gapMonths: 10
};
const weightRecord: WeightRecordHighlight = {
	type: 'weight-record',
	sortValue: TRAILING_SORT_VALUES['weight-record'],
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
		const wren = speciesCountRecord('Wren', 'this-season', 3);
		const removed = removeNarrowerScopeSpeciesRecords([blueTit, wren]);
		expect(removed).toEqual([blueTit, wren]);
	});

	it('keeps the broadest of three scopes for one species', () => {
		const anySeason = speciesCountRecord('Blackcap', 'any-season', 24);
		const removed = removeNarrowerScopeSpeciesRecords([
			speciesCountRecord('Blackcap', 'this-season', 24),
			anySeason,
			speciesCountRecord('Blackcap', 'this-year', 24)
		]);
		expect(removed).toEqual([anySeason]);
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
			speciesCountRecord('Blackcap', 'any-season', 24), // 4.01
			sessionTotalRecord('species', 'this-year', 15), // most varied 4.02
			speciesCountRecord('Chiffchaff', 'this-season', 3), // 2.01
			sessionTotalRecord('encounters', 'this-year', 120) // busiest 5.03
		]);
		expect(ordered.map((highlight) => highlight.sortValue)).toEqual([
			scopedSortValue('this-year', 3),
			scopedSortValue('this-year', 2),
			scopedSortValue('any-season', 1),
			scopedSortValue('this-season', 1)
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
			speciesCountRecord('Chiffchaff', 'this-season', 3)
		]);
		expect(ordered.map((highlight) => highlight.type)).toEqual([
			'combined-session-total-record',
			'species-count-record',
			'species-count-record'
		]);
		expect(ordered[0]).toBe(combined);
	});

	it('sorts the record block, then quietest-since, first/rare/absence, weights last', () => {
		const ordered = orderBySortValue([
			weightRecord,
			longAbsenceRetrap,
			rareSpecies,
			firstEverSpecies,
			quietestSince,
			speciesCountRecord('Reed Warbler', 'all-time', 67, {
				placementRank: 2,
				isJointPlacement: false
			})
		]);
		expect(ordered.map((highlight) => highlight.type)).toEqual([
			'species-count-record',
			'since-comparison',
			'first-ever-species',
			'rare-species',
			'long-absence-retrap',
			'weight-record'
		]);
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

describe('combineYearAndSeasonSpeciesCounts (Comb-3)', () => {
	it('leaves a single this-year species record unchanged', () => {
		const lone = speciesCountRecord('Chiffchaff', 'this-year', 5);
		expect(combineYearAndSeasonSpeciesCounts([lone])).toEqual([lone]);
	});

	it('merges multiple this-year records into one line dropping the counts', () => {
		const combined = combineYearAndSeasonSpeciesCounts([
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

	it('merges multiple this-season records independently of this-year', () => {
		const combined = combineYearAndSeasonSpeciesCounts([
			speciesCountRecord('Blackcap', 'this-year', 5),
			speciesCountRecord('Wren', 'this-year', 4),
			speciesCountRecord('Robin', 'this-season', 3),
			speciesCountRecord('Dunnock', 'this-season', 3)
		]);
		expect(combined.map((highlight) => highlight.type)).toEqual([
			'combined-species-count-record',
			'combined-species-count-record'
		]);
		expect(combined).toEqual([
			expect.objectContaining({
				scope: 'this-year',
				speciesNames: ['Blackcap', 'Wren']
			}),
			expect.objectContaining({
				scope: 'this-season',
				speciesNames: ['Robin', 'Dunnock']
			})
		]);
	});

	it('takes the list position of the first record for the scope', () => {
		const combined = combineYearAndSeasonSpeciesCounts([
			speciesCountRecord("Cetti's Warbler", 'this-year', 6),
			speciesCountRecord('Blackcap', 'any-season', 24),
			speciesCountRecord('Chiffchaff', 'this-year', 5)
		]);
		expect(combined.map((highlight) => highlight.type)).toEqual([
			'combined-species-count-record',
			'species-count-record'
		]);
	});

	it('never merges all-time or any-season records', () => {
		const allTime = speciesCountRecord('Reed Warbler', 'all-time', 67, {
			placementRank: 2,
			isJointPlacement: false
		});
		const anySeason = speciesCountRecord('Blackcap', 'any-season', 24);
		expect(combineYearAndSeasonSpeciesCounts([allTime, anySeason])).toEqual([
			allTime,
			anySeason
		]);
	});

	it('leaves a lone record per scope unchanged', () => {
		const year = speciesCountRecord('Chiffchaff', 'this-year', 5);
		const season = speciesCountRecord('Wren', 'this-season', 3);
		expect(combineYearAndSeasonSpeciesCounts([year, season])).toEqual([
			year,
			season
		]);
	});

	it('is a noop on unrelated highlights', () => {
		const pool = [rareSpecies, weightRecord];
		expect(combineYearAndSeasonSpeciesCounts(pool)).toEqual(pool);
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
			speciesCountRecord('Chiffchaff', 'this-season', 3),
			speciesCountRecord('Dunnock', 'this-year', 4),
			speciesCountRecord('Reed Warbler', 'this-year', 67),
			speciesCountRecord('Wren', 'this-year', 3),
			speciesCountRecord('Reed Warbler', 'all-time', 67, {
				placementRank: 2,
				isJointPlacement: false
			}),
			speciesCountRecord('Blackcap', 'any-season', 24),
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
			// the combined busiest/most-varied line for this-year (5.13) now heads
			// the list, above the all-time single-species record (5.01)
			['combined-session-total-record', 'combined-session-total-record'],
			['species-count-record', 'Reed Warbler'], // all-time placement, 5.01
			['species-count-record', 'Blackcap'], // any-season, 4.01
			// the four surviving this-year single-species records fold into one
			// line (3.01 + 0.3 = 3.31); Reed Warbler's this-year record was already
			// dropped by Rem-2 in favour of its all-time placement
			[
				'combined-species-count-record',
				"Blue Tit+Cetti's Warbler+Dunnock+Wren"
			],
			['species-count-record', 'Chiffchaff'], // this-season, 2.01 (lone, unmerged)
			['combined-only-of-year', 'Chaffinch+Goldfinch+Lesser Whitethroat'], // 0.8
			['weight-record', 'Blue Tit'] // 0.0
		]);
	});
});
