import { describe, it, expect } from 'vitest';
import { combineFirstEverHighlights } from '../combine-first-ever-highlights';
import { combineFirstOfYearHighlights } from '../combine-first-of-year-highlights';
import { combineOnlyOfYearHighlights } from '../combine-only-of-year-highlights';
import { firstEver, firstOfYear, rare } from './fixtures';
import type { RarityHighlight } from '../../types';

// Comb-5, Comb-6 and Comb-2 all follow the identical shape: filter the pool
// for one (type, isOnlyRecord) combination, and — once there are 2+ matches —
// fold them into a single "combined-*" highlight listing every species, left
// in the position of the first match. This table covers that shared shape
// once for all three rules; genuinely rule-specific behaviour (the
// singular/plural fixture param not mattering, and the explicit
// non-highlight-type position check) lives in the small `describe` blocks
// below the table instead of being forced into it.
type FixtureFn = (
	speciesName: string,
	isOnlyRecord: boolean,
	multipleIndividualsRecorded?: boolean
) => RarityHighlight;

type RuleCase = {
	describeName: string;
	combineFn: (highlights: RarityHighlight[]) => RarityHighlight[];
	fixtureFn: FixtureFn;
	// The isOnlyRecord value this rule folds into a combined highlight — the
	// opposite value is the "other variant" that must never be merged.
	mergesOnlyRecord: boolean;
	combinedType: string;
	// Fields the combined highlight carries beyond `type`/`speciesNames`
	// (first-ever has none; first-of-year and only-of-year both carry
	// `year`/`isCurrentYear`).
	extraFields: Record<string, unknown>;
};

const RULE_CASES: RuleCase[] = [
	{
		describeName: 'combineFirstEverHighlights (Comb-5)',
		combineFn: combineFirstEverHighlights,
		fixtureFn: firstEver,
		mergesOnlyRecord: false,
		combinedType: 'combined-first-ever',
		extraFields: {}
	},
	{
		describeName: 'combineFirstOfYearHighlights (Comb-6)',
		combineFn: combineFirstOfYearHighlights,
		fixtureFn: firstOfYear,
		mergesOnlyRecord: false,
		combinedType: 'combined-first-of-year',
		extraFields: { year: 2026, isCurrentYear: true }
	},
	{
		describeName: 'combineOnlyOfYearHighlights (Comb-2)',
		combineFn: combineOnlyOfYearHighlights,
		fixtureFn: firstOfYear,
		mergesOnlyRecord: true,
		combinedType: 'combined-only-of-year',
		extraFields: { year: 2026, isCurrentYear: true }
	}
];

describe.each(RULE_CASES)(
	'$describeName',
	({ combineFn, fixtureFn, mergesOnlyRecord, combinedType, extraFields }) => {
		it('leaves a single matching highlight unchanged', () => {
			const only = fixtureFn('Firecrest', mergesOnlyRecord);
			expect(combineFn([only])).toEqual([only]);
		});

		it('merges two matching highlights into one line listing both species', () => {
			const combined = combineFn([
				fixtureFn('Blackbird', mergesOnlyRecord),
				fixtureFn('Blackcap', mergesOnlyRecord)
			]);
			expect(combined).toEqual([
				{
					type: combinedType,
					speciesNames: ['Blackbird', 'Blackcap'],
					...extraFields
				}
			]);
		});

		it('merges three matching highlights into one line listing all species', () => {
			const combined = combineFn([
				fixtureFn('Blackbird', mergesOnlyRecord),
				fixtureFn('Blackcap', mergesOnlyRecord),
				fixtureFn("Cetti's Warbler", mergesOnlyRecord)
			]);
			expect(combined).toEqual([
				{
					type: combinedType,
					speciesNames: ['Blackbird', 'Blackcap', "Cetti's Warbler"],
					...extraFields
				}
			]);
		});

		it('never merges the other isOnlyRecord variant', () => {
			const a = fixtureFn('Robin', !mergesOnlyRecord);
			const b = fixtureFn('Wren', !mergesOnlyRecord);
			expect(combineFn([a, b])).toEqual([a, b]);
		});

		it('merges only the matching items, leaving the other variant in place', () => {
			const untouched = fixtureFn('Robin', !mergesOnlyRecord);
			const combined = combineFn([
				untouched,
				fixtureFn('Blackbird', mergesOnlyRecord),
				fixtureFn('Blackcap', mergesOnlyRecord)
			]);
			expect(combined).toEqual([
				untouched,
				{
					type: combinedType,
					speciesNames: ['Blackbird', 'Blackcap'],
					...extraFields
				}
			]);
		});

		it('is a noop on a pool with no matching highlights', () => {
			const pool = [
				rare('Wryneck', 2),
				fixtureFn('Chaffinch', !mergesOnlyRecord)
			];
			expect(combineFn(pool)).toEqual(pool);
		});
	}
);

// Rule-specific: only combineFirstEverHighlights and combineFirstOfYearHighlights
// take a `multipleIndividualsRecorded` fixture param that must never affect
// merging (combineOnlyOfYearHighlights shares the same fixture, but has no
// test of its own asserting this — nothing in its source reads that field
// differently either, so there's nothing rule-specific to add here for it).
describe('combineFirstEverHighlights (Comb-5) — rule-specific', () => {
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

	it('takes the list position of the first first-ever highlight, ahead of an unrelated highlight type', () => {
		const combined = combineFirstEverHighlights([
			firstEver('Blackbird', false),
			rare('Wryneck', 2),
			firstEver('Blackcap', false)
		]);
		expect(combined.map((highlight) => highlight.type)).toEqual([
			'combined-first-ever',
			'rare-species'
		]);
	});
});

describe('combineFirstOfYearHighlights (Comb-6) — rule-specific', () => {
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
});
