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
	RecordScope,
	SessionHighlight,
	SessionTotalMetric,
	SessionTotalRecordHighlight,
	SinceComparisonHighlight,
	SpeciesCountRecordHighlight,
	WeightRecordHighlight
} from '../session-highlights';

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
		speciesName,
		year: 2026,
		isCurrentYear: true,
		multipleIndividualsRecorded: false,
		isOnlyRecord
	};
}

const busiestSince: SinceComparisonHighlight = {
	type: 'since-comparison',
	kind: 'busiest',
	value: 120,
	sinceDate: '2025-09-06'
};
const quietestSince: SinceComparisonHighlight = {
	type: 'since-comparison',
	kind: 'quietest',
	value: 3,
	sinceDate: '2023-09-14'
};
const firstEverSpecies: FirstEverSpeciesHighlight = {
	type: 'first-ever-species',
	speciesName: 'Firecrest',
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

describe('removeRedundantHighlights', () => {
	describe('Rem-1 — busiest-since dropped when a busiest record is held', () => {
		it('drops a busiest-since comparison when a busiest session-total record is present', () => {
			const removed = removeRedundantHighlights([
				sessionTotalRecord('encounters', 'this-year', 120),
				busiestSince
			]);
			expect(removed).toEqual([
				sessionTotalRecord('encounters', 'this-year', 120)
			]);
		});

		it('keeps a busiest-since comparison when no busiest record is present', () => {
			const removed = removeRedundantHighlights([
				sessionTotalRecord('species', 'this-year', 15),
				busiestSince
			]);
			expect(removed).toContainEqual(busiestSince);
		});

		it('never drops a quietest-since comparison', () => {
			const removed = removeRedundantHighlights([
				sessionTotalRecord('encounters', 'this-year', 120),
				quietestSince
			]);
			expect(removed).toContainEqual(quietestSince);
		});
	});

	describe('Rem-2 — narrower-scope species records dropped', () => {
		it('drops a this-year species record when the species holds an all-time record', () => {
			const removed = removeRedundantHighlights([
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
			const removed = removeRedundantHighlights([blueTit, wren]);
			expect(removed).toEqual([blueTit, wren]);
		});

		it('keeps the broadest of three scopes for one species', () => {
			const anySeason = speciesCountRecord('Blackcap', 'any-season', 24);
			const removed = removeRedundantHighlights([
				speciesCountRecord('Blackcap', 'this-season', 24),
				anySeason,
				speciesCountRecord('Blackcap', 'this-year', 24)
			]);
			expect(removed).toEqual([anySeason]);
		});
	});

	it('does not mutate the input list', () => {
		const pool = [
			sessionTotalRecord('encounters', 'this-year', 120),
			busiestSince
		];
		const snapshot = [...pool];
		removeRedundantHighlights(pool);
		expect(pool).toEqual(snapshot);
	});
});

describe('orderByScope', () => {
	it('interleaves session-total and species-count records by scope breadth', () => {
		const ordered = orderByScope([
			speciesCountRecord('Blue Tit', 'this-year', 5),
			speciesCountRecord('Chiffchaff', 'this-season', 3),
			sessionTotalRecord('encounters', 'all-time', 200),
			speciesCountRecord('Blackcap', 'any-season', 24)
		]);
		expect(
			ordered.map((highlight) =>
				'scope' in highlight ? highlight.scope : null
			)
		).toEqual(['all-time', 'any-season', 'this-year', 'this-season']);
	});

	it('places the combined session-total record by its own scope', () => {
		const combined: SessionHighlight = {
			type: 'combined-session-total-record',
			scope: 'this-year',
			encounterValue: 120,
			speciesValue: 15,
			...periodFields
		};
		const ordered = orderByScope([
			speciesCountRecord('Chiffchaff', 'this-season', 3),
			combined,
			speciesCountRecord('Reed Warbler', 'all-time', 67, {
				placementRank: 2,
				isJointPlacement: false
			})
		]);
		expect(ordered.map((highlight) => highlight.type)).toEqual([
			'species-count-record',
			'combined-session-total-record',
			'species-count-record'
		]);
		expect(ordered[1]).toBe(combined);
	});

	it('sorts the record block, then quietest-since, first/rare/absence, weights last', () => {
		const ordered = orderByScope([
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

	it('preserves generation order within a shared scope', () => {
		const blueTit = speciesCountRecord('Blue Tit', 'this-year', 5);
		const cettis = speciesCountRecord("Cetti's Warbler", 'this-year', 5);
		const dunnock = speciesCountRecord('Dunnock', 'this-year', 4);
		const ordered = orderByScope([blueTit, cettis, dunnock]);
		expect(ordered).toEqual([blueTit, cettis, dunnock]);
	});

	it('does not mutate the input list', () => {
		const pool = [
			rareSpecies,
			sessionTotalRecord('encounters', 'all-time', 74)
		];
		const snapshot = [...pool];
		orderByScope(pool);
		expect(pool).toEqual(snapshot);
	});
});

describe('combineHighlights', () => {
	describe('Comb-1 — busiest + most-varied over the same scope', () => {
		it('merges same-scope encounters and species records into one combined record', () => {
			const combined = combineHighlights([
				sessionTotalRecord('encounters', 'this-year', 120),
				sessionTotalRecord('species', 'this-year', 15)
			]);
			expect(combined).toEqual([
				{
					type: 'combined-session-total-record',
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
			const combined = combineHighlights([encounters, species]);
			expect(combined).toEqual([encounters, species]);
		});

		it('takes the list position of the encounters record', () => {
			const combined = combineHighlights([
				sessionTotalRecord('species', 'this-year', 15),
				sessionTotalRecord('encounters', 'this-year', 120)
			]);
			expect(combined).toHaveLength(1);
			expect(combined[0].type).toBe('combined-session-total-record');
		});
	});

	describe('Comb-2 — only-of-year species merged', () => {
		it('merges multiple only-of-year highlights into one listing every species', () => {
			const combined = combineHighlights([
				firstOfYear('Chaffinch', true),
				firstOfYear('Goldfinch', true),
				firstOfYear('Lesser Whitethroat', true)
			]);
			expect(combined).toEqual([
				{
					type: 'combined-only-of-year',
					speciesNames: ['Chaffinch', 'Goldfinch', 'Lesser Whitethroat'],
					year: 2026,
					isCurrentYear: true
				}
			]);
		});

		it('leaves a single only-of-year highlight unchanged', () => {
			const only = firstOfYear('Chaffinch', true);
			expect(combineHighlights([only])).toEqual([only]);
		});

		it('does not merge first-of-year (non-only) highlights', () => {
			const first = firstOfYear('Chaffinch', false);
			const secondFirst = firstOfYear('Goldfinch', false);
			expect(combineHighlights([first, secondFirst])).toEqual([
				first,
				secondFirst
			]);
		});

		it('merges only onlys, leaving first-of-year items in place', () => {
			const firstA = firstOfYear('Robin', false);
			const combined = combineHighlights([
				firstA,
				firstOfYear('Chaffinch', true),
				firstOfYear('Goldfinch', true)
			]);
			expect(combined).toEqual([
				firstA,
				{
					type: 'combined-only-of-year',
					speciesNames: ['Chaffinch', 'Goldfinch'],
					year: 2026,
					isCurrentYear: true
				}
			]);
		});
	});
});

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
			['species-count-record', 'Reed Warbler'], // all-time placement
			['species-count-record', 'Blackcap'], // any-season
			['combined-session-total-record', 'combined-session-total-record'], // this-year
			['species-count-record', 'Blue Tit'],
			['species-count-record', "Cetti's Warbler"],
			['species-count-record', 'Dunnock'],
			['species-count-record', 'Wren'],
			['species-count-record', 'Chiffchaff'], // this-season
			['combined-only-of-year', 'Chaffinch+Goldfinch+Lesser Whitethroat'],
			['weight-record', 'Blue Tit']
		]);
	});
});
