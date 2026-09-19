import { describe, it, expect } from 'vitest';
import { TABLE_QUERIES } from '../index';
import { GENERATED_SNAPSHOT_FIXTURES } from '../../lib/snapshot-fixtures';

/**
 * Every fixture path a `queries/` entry declares, flattened across the whole
 * directory.
 */
const queryFixturePaths = TABLE_QUERIES.flatMap((query) => query.fixturePaths);

/**
 * The table-sourced subset of `GENERATED_SNAPSHOT_FIXTURES` — everything under
 * `tables/`, as opposed to an RPC-backed fixture (`core_stats/`,
 * `biometrics_stats/`, etc.), which `queries/` deliberately doesn't cover
 * (see `queries/types.ts`).
 */
const tableSourcedFixtures = GENERATED_SNAPSHOT_FIXTURES.filter((path) =>
	path.startsWith('tables/')
);

describe('queries/ directory', () => {
	describe.each(TABLE_QUERIES.map((query) => [`${query.table}/${query.name}`, query] as const))(
		'%s',
		(label, query) => {
			it('exports a non-empty root table name', () => {
				expect(query.table).toBeTypeOf('string');
				expect(query.table.length).toBeGreaterThan(0);
			});

			it('exports a non-empty query name', () => {
				expect(query.name).toBeTypeOf('string');
				expect(query.name.length).toBeGreaterThan(0);
			});

			it('exports a non-empty select string', () => {
				expect(query.select).toBeTypeOf('string');
				expect(query.select.trim().length).toBeGreaterThan(0);
			});

			it('exports at least one fixture path', () => {
				expect(query.fixturePaths.length).toBeGreaterThan(0);
			});

			it('every fixture path follows tables/<table>/<...>.<name>.json', () => {
				for (const fixturePath of query.fixturePaths) {
					expect(fixturePath.startsWith(`tables/${query.table}/`)).toBe(true);
					expect(fixturePath.endsWith(`.${query.name}.json`)).toBe(true);
				}
			});
		}
	);

	describe('consistency with GENERATED_SNAPSHOT_FIXTURES (lib/snapshot-fixtures.ts)', () => {
		it('has no query fixture path missing from GENERATED_SNAPSHOT_FIXTURES', () => {
			const missing = queryFixturePaths.filter(
				(path) => !(GENERATED_SNAPSHOT_FIXTURES as readonly string[]).includes(path)
			);
			expect(missing).toEqual([]);
		});

		it('has no table-sourced generated fixture missing a matching queries/ entry', () => {
			const missing = tableSourcedFixtures.filter(
				(path) => !queryFixturePaths.includes(path)
			);
			expect(missing).toEqual([]);
		});

		it('matches the table-sourced subset of GENERATED_SNAPSHOT_FIXTURES 1:1', () => {
			expect([...queryFixturePaths].sort()).toEqual(
				[...tableSourcedFixtures].sort()
			);
		});
	});
});
