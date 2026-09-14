import { describe, it, expect } from 'vitest';
import {
	GENERATED_SNAPSHOT_FIXTURES,
	UNGENERATED_SNAPSHOT_FIXTURES,
	collectShapePaths,
	findSnapshotDrift,
	formatSnapshotDrift
} from '../snapshot-fixtures';

describe('collectShapePaths', () => {
	it('collapses array indices so every row shares one column path', () => {
		const paths = collectShapePaths([{ a: 1 }, { a: 2 }]);
		expect([...paths.keys()]).toEqual(['[]', '[].a']);
	});

	it('unions the columns across rows', () => {
		const paths = collectShapePaths([{ a: 1 }, { b: 2 }]);
		expect([...paths.keys()].sort()).toEqual(['[]', '[].a', '[].b']);
	});

	it('keeps the first value found at each column path as a sample', () => {
		expect(collectShapePaths([{ a: 7 }, { a: 9 }]).get('[].a')).toBe(7);
	});

	it('walks nested objects and arrays', () => {
		const paths = collectShapePaths({ yearly: [{ counts: { adult: 1 } }] });
		expect([...paths.keys()]).toEqual([
			'yearly',
			'yearly[]',
			'yearly[].counts',
			'yearly[].counts.adult'
		]);
	});
});

describe('findSnapshotDrift', () => {
	describe('in-sync fixtures', () => {
		it('reports no drift for identical columns and row counts', () => {
			const rows = [
				{ species_name: 'Robin', bird_count: 3, nested: { a: [1, 2] } }
			];
			expect(findSnapshotDrift(rows, structuredClone(rows))).toEqual([]);
		});

		it('reports no drift when only values, ids and row order differ', () => {
			const fixture = [
				{ id: 40, ring_no: 'ABTITMIS', bird_count: 3 },
				{ id: 34, ring_no: 'ARRETRAP', bird_count: 9 }
			];
			const generated = [
				{ id: 1, ring_no: 'ARRETRAP', bird_count: 4 },
				{ id: 17, ring_no: 'ABTITMIS', bird_count: 3 }
			];
			expect(findSnapshotDrift(fixture, generated)).toEqual([]);
		});

		it('reports no drift for two empty arrays', () => {
			expect(findSnapshotDrift([], [])).toEqual([]);
		});
	});

	describe('column drift', () => {
		it('flags a column the fixture has but the database no longer returns', () => {
			const drifts = findSnapshotDrift(
				[{ bird_count: 3, max_wing: 82 }],
				[{ bird_count: 3 }]
			);
			expect(drifts).toEqual([
				{ path: '[].max_wing', kind: 'extra-in-fixture', sampleValue: 82 }
			]);
		});

		it('flags a column the database returns but the fixture does not have', () => {
			const drifts = findSnapshotDrift(
				[{ bird_count: 3 }],
				[{ bird_count: 3, new_adult_count: 7 }]
			);
			expect(drifts).toEqual([
				{
					path: '[].new_adult_count',
					kind: 'missing-from-fixture',
					sampleValue: 7
				}
			]);
		});

		it('flags column drift in both directions at once', () => {
			const drifts = findSnapshotDrift(
				[{ max_wing: 82 }],
				[{ new_adult_count: 7 }]
			);
			expect(drifts.map(({ path, kind }) => [path, kind])).toEqual([
				['[].max_wing', 'extra-in-fixture'],
				['[].new_adult_count', 'missing-from-fixture']
			]);
		});

		it('flags a column removed from a nested embedded relation', () => {
			const drifts = findSnapshotDrift(
				{ birds: [{ encounters: [{ weight: 19.1 }] }] },
				{ birds: [{ encounters: [{}] }] }
			);
			expect(drifts.map((drift) => drift.path)).toEqual([
				'birds[].encounters[].weight'
			]);
		});
	});

	describe('row-count drift', () => {
		it('flags a fixture with fewer rows than the database now returns', () => {
			const row = { species_name: 'Robin', bird_count: 3 };
			const drifts = findSnapshotDrift(
				[row, row, row],
				[row, row, row, row, row]
			);
			expect(drifts).toEqual([
				{
					path: '[]',
					kind: 'row-count-mismatch',
					fixtureRowCount: 3,
					generatedRowCount: 5
				}
			]);
		});

		it('flags a fixture with more rows than the database now returns', () => {
			const row = { species_name: 'Robin', bird_count: 3 };
			const drifts = findSnapshotDrift([row, row, row], [row]);
			expect(drifts).toEqual([
				{
					path: '[]',
					kind: 'row-count-mismatch',
					fixtureRowCount: 3,
					generatedRowCount: 1
				}
			]);
		});

		it('flags a row-count change on an array under an object key', () => {
			const row = { period: '2024', bird_count: 3 };
			const drifts = findSnapshotDrift(
				{ yearly: [row], monthly: [row, row] },
				{ yearly: [row], monthly: [row, row, row] }
			);
			expect(drifts).toEqual([
				{
					path: 'monthly[]',
					kind: 'row-count-mismatch',
					fixtureRowCount: 2,
					generatedRowCount: 3
				}
			]);
		});

		it('flags a row-count change in an array nested inside another array', () => {
			const drifts = findSnapshotDrift(
				[{ ring_no: 'A', encounters: [{ weight: 19.1 }] }],
				[{ ring_no: 'A', encounters: [{ weight: 19.1 }, { weight: 20.2 }] }]
			);
			expect(drifts).toEqual([
				{
					path: '[].encounters[]',
					kind: 'row-count-mismatch',
					fixtureRowCount: 1,
					generatedRowCount: 2
				}
			]);
		});

		it('reports only the outermost array when a nested count moves with it', () => {
			const bird = { ring_no: 'A', encounters: [{ weight: 19.1 }] };
			const drifts = findSnapshotDrift([bird], [bird, bird]);
			expect(drifts).toEqual([
				{
					path: '[]',
					kind: 'row-count-mismatch',
					fixtureRowCount: 1,
					generatedRowCount: 2
				}
			]);
		});

		it('reports no row-count drift when the counts match', () => {
			const drifts = findSnapshotDrift(
				[{ bird_count: 3 }, { bird_count: 9 }],
				[{ bird_count: 4 }, { bird_count: 1 }]
			);
			expect(drifts).toEqual([]);
		});
	});

	describe('edge cases', () => {
		it('flags a fixture whose rows have all disappeared', () => {
			const drifts = findSnapshotDrift([{ a: 1 }], []);
			expect(drifts.map(({ path, kind }) => [path, kind])).toEqual([
				['[]', 'extra-in-fixture'],
				['[]', 'row-count-mismatch'],
				['[].a', 'extra-in-fixture']
			]);
		});

		it('flags a fixture that is empty where the database now returns rows', () => {
			const drifts = findSnapshotDrift({ rows: [] }, { rows: [{ a: 1 }] });
			expect(drifts.map(({ path, kind }) => [path, kind])).toEqual([
				['rows[]', 'missing-from-fixture'],
				['rows[]', 'row-count-mismatch'],
				['rows[].a', 'missing-from-fixture']
			]);
		});

		it('treats null as a leaf rather than an object to recurse into', () => {
			expect(
				findSnapshotDrift({ speciesStats: null }, { speciesStats: null })
			).toEqual([]);
			expect(
				findSnapshotDrift(
					{ speciesStats: null },
					{ speciesStats: { bird_count: 1 } }
				).map((drift) => drift.path)
			).toEqual(['speciesStats.bird_count']);
		});
	});
});

describe('formatSnapshotDrift', () => {
	it('names the file, each difference and the regeneration command', () => {
		const message = formatSnapshotDrift(
			'core_stats/alpha.by-species.json',
			findSnapshotDrift([{ bird_count: 3, max_wing: 82 }], [{ bird_count: 3 }])
		);
		expect(message).toContain('core_stats/alpha.by-species.json has drifted');
		expect(message).toContain('[].max_wing');
		expect(message).toContain('a removed column?');
		expect(message).toContain('npm run db:generate-snapshots');
	});

	it('reports a row-count difference with both counts', () => {
		const row = { bird_count: 3 };
		const message = formatSnapshotDrift(
			'core_stats/alpha.by-species.json',
			findSnapshotDrift([row, row, row], [row, row, row, row, row])
		);
		expect(message).toContain('[]: 3 rows in the fixture, 5 in freshly');
		expect(message).toContain('a stale row set?');
	});
});

describe('fixture coverage lists', () => {
	it('covers the 28 generator-produced fixtures', () => {
		expect(GENERATED_SNAPSHOT_FIXTURES).toHaveLength(28);
	});

	it('leaves the 8 hand-maintained fixtures uncovered (issue #894)', () => {
		expect(UNGENERATED_SNAPSHOT_FIXTURES).toHaveLength(8);
	});

	it('spells every fixture as a source-directory-relative path (#882)', () => {
		const allFixtures = [
			...GENERATED_SNAPSHOT_FIXTURES,
			...UNGENERATED_SNAPSHOT_FIXTURES
		];
		const flatlyNamed = allFixtures.filter(
			(relativePath) => !relativePath.includes('/')
		);
		expect(flatlyNamed).toEqual([]);
	});

	it('lists no fixture in both', () => {
		const overlap = GENERATED_SNAPSHOT_FIXTURES.filter((filename) =>
			(UNGENERATED_SNAPSHOT_FIXTURES as readonly string[]).includes(filename)
		);
		expect(overlap).toEqual([]);
	});
});
