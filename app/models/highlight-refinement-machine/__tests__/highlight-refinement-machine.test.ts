import { describe, it, expect } from 'vitest';
import {
	combineFirstEverHighlights,
	combineFirstOfYearHighlights,
	combineOnlyOfYearHighlights,
	combineSessionTotalRecords,
	combineSpeciesPlacementRecords,
	combineWeightRecords,
	combineYearSpeciesCounts,
	orderBySortValue,
	removeBusiestSinceWhenBusiestRecordHeld,
	removeCountAndWeightHighlightsForRareSpecies,
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
	type SessionTotalJuvRecordHighlight,
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

function sessionTotalJuvRecord(
	scope: RecordScope,
	value: number
): SessionTotalJuvRecordHighlight {
	return {
		type: 'session-total-juv-record',
		sortValue: juvSortValue('juv-session-total', scope),
		scope,
		value,
		...periodFields
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
	scope: 'all-time',
	extreme: 'heaviest',
	weight: 13.1,
	placementRank: 1,
	isJointPlacement: false,
	year: 2024,
	isCurrentYear: false
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
		// Weight records are reconciled by combineWeightRecords (Comb-6), not here
		const pool = [busiestSince, weightRecord];
		expect(removeNarrowerScopeSpeciesRecords(pool)).toEqual(pool);
	});

	it('leaves this-year and all-time weight records untouched (handled by Comb-6)', () => {
		const pool = [
			weightRecord,
			{ ...weightRecord, scope: 'this-year' as const }
		];
		expect(removeNarrowerScopeSpeciesRecords(pool)).toEqual(pool);
	});
});

describe('removeCountAndWeightHighlightsForRareSpecies (Rem-3)', () => {
	// A weight record for the rare species itself (rareSpecies is 'Wryneck')
	const wryneckWeight: WeightRecordHighlight = {
		type: 'weight-record',
		sortValue: familySortValue('weight-record'),
		speciesName: 'Wryneck',
		scope: 'all-time',
		extreme: 'heaviest',
		weight: 30.2,
		placementRank: 1,
		isJointPlacement: false,
		year: 2024,
		isCurrentYear: false
	};

	it("drops the rare species' own count and weight highlights", () => {
		const removed = removeCountAndWeightHighlightsForRareSpecies([
			rareSpecies,
			speciesCountRecord('Wryneck', 'all-time', 2),
			speciesJuvCountRecord('Wryneck', 'this-year', 1),
			wryneckWeight
		]);
		expect(removed).toEqual([rareSpecies]);
	});

	it("keeps other species' count and weight highlights, and session-wide records", () => {
		const pool = [
			rareSpecies,
			sessionTotalRecord('encounters', 'this-year', 120),
			sessionTotalJuvRecord('all-time', 8),
			speciesCountRecord('Reed Warbler', 'this-year', 67),
			speciesJuvCountRecord('Reed Warbler', 'all-time', 12),
			busiestSince,
			quietestSince,
			weightRecord // Blue Tit
		];
		expect(removeCountAndWeightHighlightsForRareSpecies(pool)).toEqual(pool);
	});

	it('leaves the pool untouched when no rare-species highlight is present', () => {
		const pool = [
			sessionTotalRecord('encounters', 'this-year', 120),
			speciesCountRecord('Reed Warbler', 'this-year', 67),
			weightRecord
		];
		expect(removeCountAndWeightHighlightsForRareSpecies(pool)).toEqual(pool);
	});

	it("keeps the rare species' non-count/weight highlights alongside it", () => {
		const removed = removeCountAndWeightHighlightsForRareSpecies([
			rareSpecies,
			firstEverSpecies,
			longAbsenceRetrap,
			firstOfYear('Chaffinch', true),
			wryneckWeight
		]);
		expect(removed).toEqual([
			rareSpecies,
			firstEverSpecies,
			longAbsenceRetrap,
			firstOfYear('Chaffinch', true)
		]);
	});

	it("drops each rare species' own records when several rare species are present", () => {
		const secondRare: RareSpeciesHighlight = {
			type: 'rare-species',
			sortValue: familySortValue('rare-species'),
			speciesName: 'Hawfinch',
			totalSessionDays: 3
		};
		const removed = removeCountAndWeightHighlightsForRareSpecies([
			rareSpecies,
			secondRare,
			wryneckWeight,
			speciesCountRecord('Hawfinch', 'all-time', 3),
			weightRecord, // Blue Tit — not rare, kept
			sessionTotalRecord('encounters', 'this-year', 120)
		]);
		expect(removed).toEqual([
			rareSpecies,
			secondRare,
			weightRecord,
			sessionTotalRecord('encounters', 'this-year', 120)
		]);
	});

	it('does not mutate the input list', () => {
		const pool = [rareSpecies, wryneckWeight];
		const snapshot = [...pool];
		removeCountAndWeightHighlightsForRareSpecies(pool);
		expect(pool).toEqual(snapshot);
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

	it('merges two strict 2nd-best records, keeping a shared count', () => {
		const combined = combineSpeciesPlacementRecords([
			secondBest('Dunnock', 6),
			secondBest('Whitethroat', 6)
		]);
		expect(combined).toEqual([
			{
				type: 'combined-species-placement-record',
				sortValue: combinedSortValue([
					secondBest('Dunnock', 6),
					secondBest('Whitethroat', 6)
				]),
				placementRank: 2,
				species: [
					{ name: 'Dunnock', isJoint: false },
					{ name: 'Whitethroat', isJoint: false }
				],
				value: 6
			}
		]);
	});

	it('drops the count when every merged placement is joint', () => {
		const combined = combineSpeciesPlacementRecords([
			secondBest('Dunnock', 6, true),
			secondBest('Whitethroat', 6, true)
		]);
		expect(combined).toEqual([
			{
				type: 'combined-species-placement-record',
				sortValue: combinedSortValue([
					secondBest('Dunnock', 6, true),
					secondBest('Whitethroat', 6, true)
				]),
				placementRank: 2,
				species: [
					{ name: 'Dunnock', isJoint: true },
					{ name: 'Whitethroat', isJoint: true }
				]
			}
		]);
	});

	it('flags each joint species and keeps the shared count in a mixed group', () => {
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
				],
				value: 6
			})
		]);
	});

	it('drops the count when merged placements disagree on it', () => {
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
			weightRecord,
			secondBest('Whitethroat', 6)
		]);
		expect(combined.map((highlight) => highlight.type)).toEqual([
			'combined-species-placement-record',
			'weight-record'
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
		const pool = [rareSpecies, weightRecord];
		expect(combineSpeciesPlacementRecords(pool)).toEqual(pool);
	});

	it('does not mutate the input list', () => {
		const pool = [secondBest('Dunnock', 6), secondBest('Whitethroat', 6)];
		const snapshot = [...pool];
		combineSpeciesPlacementRecords(pool);
		expect(pool).toEqual(snapshot);
	});
});

describe('combineFirstEverHighlights (Comb-5)', () => {
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

describe('combineFirstOfYearHighlights (Comb-6)', () => {
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
				sortValue: combinedSortValue([heaviestThisYear, heaviestAllTime2nd]),
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
		const pool = [weightRecord, rareSpecies];
		expect(combineWeightRecords(pool)).toEqual(pool);
	});

	it('does not mutate the input list', () => {
		const pool = [heaviestAllTime2nd, heaviestThisYear];
		const snapshot = [...pool];
		combineWeightRecords(pool);
		expect(pool).toEqual(snapshot);
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

	it("suppresses a rare species' own count and weight highlights but keeps other species' and session-wide records", () => {
		const wryneckWeight: WeightRecordHighlight = {
			type: 'weight-record',
			sortValue: familySortValue('weight-record'),
			speciesName: 'Wryneck',
			scope: 'all-time',
			extreme: 'heaviest',
			weight: 30.2,
			placementRank: 1,
			isJointPlacement: false,
			year: 2024,
			isCurrentYear: false
		};
		const pool: SessionHighlight[] = [
			rareSpecies, // Wryneck
			speciesCountRecord('Wryneck', 'all-time', 2), // dropped — rare species' own
			wryneckWeight, // dropped — rare species' own
			firstEverSpecies,
			sessionTotalRecord('encounters', 'this-year', 120), // kept — session-wide
			speciesCountRecord('Reed Warbler', 'this-year', 67), // kept — other species
			weightRecord // Blue Tit — kept — other species
		];
		const machined = runHighlightMachine(pool);
		// The rare bird's own count/weight lines are dropped; other species' and
		// session-wide records survive. first-ever above rare by sort value.
		expect(
			machined.map((highlight) =>
				'speciesName' in highlight
					? [highlight.type, highlight.speciesName]
					: [highlight.type]
			)
		).toEqual([
			['first-ever-species', 'Firecrest'],
			['rare-species', 'Wryneck'],
			['session-total-record'],
			['species-count-record', 'Reed Warbler'],
			['weight-record', 'Blue Tit']
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

	it('folds several 2nd/3rd best-day placements into one line per rank', () => {
		const pool: SessionHighlight[] = [
			speciesCountRecord('Dunnock', 'all-time', 6, {
				placementRank: 2,
				isJointPlacement: false
			}),
			speciesCountRecord('Whitethroat', 'all-time', 6, {
				placementRank: 2,
				isJointPlacement: true
			}),
			speciesCountRecord('Wren', 'all-time', 4, {
				placementRank: 3,
				isJointPlacement: false
			}),
			speciesCountRecord('Robin', 'all-time', 4, {
				placementRank: 3,
				isJointPlacement: false
			}),
			weightRecord
		];
		const machined = runHighlightMachine(pool);
		expect(
			machined.map((highlight) =>
				highlight.type === 'combined-species-placement-record'
					? [
							highlight.type,
							highlight.placementRank,
							highlight.species.map((entry) => entry.name).join('+')
						]
					: [highlight.type]
			)
		).toEqual([
			['combined-species-placement-record', 2, 'Dunnock+Whitethroat'],
			['combined-species-placement-record', 3, 'Wren+Robin'],
			['weight-record']
		]);
	});

	it('merges a this-year weight leader with its all-time placement into one line', () => {
		const pool: SessionHighlight[] = [
			{ ...weightRecord, scope: 'all-time', placementRank: 2 },
			{ ...weightRecord, scope: 'this-year', placementRank: 1 }
		];
		const machined = runHighlightMachine(pool);
		expect(machined.map((highlight) => highlight.type)).toEqual([
			'combined-weight-record'
		]);
	});
});
