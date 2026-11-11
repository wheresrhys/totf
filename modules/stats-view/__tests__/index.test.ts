import { describe, it, expect } from 'vitest';
import {
	AggregateByToggle,
	CombineYearsToggle,
	EmptyMonthsToggle,
	CountsBiometricsToggle,
	createStatsTableBody,
	ageBlockStartBorder,
	ageBlockEndBorder,
	columnBlock,
	createNameLinkCell,
	buildStandardColumnConfigs,
	buildBiometricColumnConfigs,
	buildTotalsRowCells
} from '@/modules/stats-view';
// Type-only exports have no runtime presence to assert on — importing them
// here still means a type removed from the barrel fails `npm run type:check`
// (tsc's program follows this import), the same regression this test guards
// against for the value exports below.
import type {
	AggregateByValue,
	StatsTableBodyConfig,
	TotalsRowCellsInput
} from '@/modules/stats-view';

// Regression guard for the barrel's widened scope (#1353):
// `AggregateByToggle`, `CombineYearsToggle`, `EmptyMonthsToggle`,
// `StatsTableBody` and `StatsTableColumnConfigs` moved here from
// `modules/ui-kit`, which previously guarded them in its own equivalent
// test (see `modules/ui-kit/__tests__/index.test.ts`'s own comment on why
// they left). This test only covers that widened scope, not this module's
// pre-existing exports (row-model helpers, the five stats-table components)
// which have no such regression guard of their own yet.
describe('modules/stats-view barrel (widened scope)', () => {
	it('re-exports every name that moved here from modules/ui-kit', () => {
		expect(AggregateByToggle).toBeDefined();
		expect(CombineYearsToggle).toBeDefined();
		expect(EmptyMonthsToggle).toBeDefined();
		expect(createStatsTableBody).toBeDefined();
		expect(ageBlockStartBorder).toBeDefined();
		expect(ageBlockEndBorder).toBeDefined();
		expect(columnBlock).toBeDefined();
		expect(createNameLinkCell).toBeDefined();
		expect(buildStandardColumnConfigs).toBeDefined();
		expect(buildTotalsRowCells).toBeDefined();
	});

	// Type-only exports have no runtime presence `expect` can assert on. The
	// `import type` above already does the equivalent check: if any of these
	// names stopped being exported from the barrel, `tsc` would fail with
	// "has no exported member" on that import line alone, regardless of
	// whether the type is referenced afterwards. This alias exists only to
	// give that import a reference, satisfying the unused-import lint rule.
	type BarrelTypeExistenceCheck = [
		AggregateByValue,
		StatsTableBodyConfig<unknown, unknown>,
		TotalsRowCellsInput<{ total: number }>
	];
	it('type-checks every type-only export referenced above', () => {
		const check: BarrelTypeExistenceCheck | undefined = undefined;
		expect(check).toBeUndefined();
	});
});

// Regression guard for #1433's new shared foundation: `CountsBiometricsToggle`
// and `buildBiometricColumnConfigs`, added directly to this module rather than
// moved in from `modules/ui-kit`, so kept as a sibling check instead of mixing
// into the "moved from ui-kit" framing above.
describe('modules/stats-view barrel (Counts/Biometrics toggle foundation)', () => {
	it('re-exports CountsBiometricsToggle and buildBiometricColumnConfigs', () => {
		expect(CountsBiometricsToggle).toBeDefined();
		expect(buildBiometricColumnConfigs).toBeDefined();
	});
});
