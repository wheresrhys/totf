import { describe, it, expect } from 'vitest';
import {
	buildFixDispatchParams,
	isDiscrepancyRowCoveredByFixDispatch,
	type DiscrepancyRowScope,
	type StatsCacheFixDispatch
} from '../discrepancy-row-fix-scope';

function overallRow(
	overrides: Partial<DiscrepancyRowScope> = {}
): DiscrepancyRowScope {
	return { temporalUnit: 'month', period: '2026-01-01', ...overrides };
}

function bySpeciesRow(
	overrides: Partial<DiscrepancyRowScope> = {}
): DiscrepancyRowScope {
	return { ...overallRow(), speciesId: 42, ...overrides };
}

const allTimeRow: DiscrepancyRowScope = { temporalUnit: 'all-time' };

function dispatch(
	overrides: Partial<StatsCacheFixDispatch> = {}
): StatsCacheFixDispatch {
	return { temporalUnit: 'month', ...overrides };
}

describe('buildFixDispatchParams', () => {
	describe('overall row (no speciesId)', () => {
		it("scopes 'fix just this issue' to the row's own period and omits speciesIds", () => {
			expect(buildFixDispatchParams(overallRow(), 'this-issue')).toEqual({
				temporalUnit: 'month',
				periods: ['2026-01-01']
			});
		});

		it("omits periods for 'fix for all time periods' and still omits speciesIds", () => {
			expect(buildFixDispatchParams(overallRow(), 'all-periods')).toEqual({
				temporalUnit: 'month'
			});
		});

		it('omits periods for an all-time row even on the narrowest button, since it has none', () => {
			expect(buildFixDispatchParams(allTimeRow, 'this-issue')).toEqual({
				temporalUnit: 'all-time'
			});
		});
	});

	describe('by-species row', () => {
		it("scopes 'fix just this issue' to the row's own period and species id", () => {
			expect(buildFixDispatchParams(bySpeciesRow(), 'this-issue')).toEqual({
				temporalUnit: 'month',
				periods: ['2026-01-01'],
				speciesIds: [42]
			});
		});

		it("omits periods but keeps the species id for 'fix for all time periods'", () => {
			expect(buildFixDispatchParams(bySpeciesRow(), 'all-periods')).toEqual({
				temporalUnit: 'month',
				speciesIds: [42]
			});
		});

		it("keeps the row's period but omits speciesIds for 'fix for all species'", () => {
			expect(buildFixDispatchParams(bySpeciesRow(), 'all-species')).toEqual({
				temporalUnit: 'month',
				periods: ['2026-01-01']
			});
		});

		it("omits both periods and speciesIds for 'fix for all species and time periods'", () => {
			expect(
				buildFixDispatchParams(bySpeciesRow(), 'all-species-and-periods')
			).toEqual({ temporalUnit: 'month' });
		});
	});
});

describe('isDiscrepancyRowCoveredByFixDispatch', () => {
	describe('temporal unit matching', () => {
		it("excludes a row whose temporalUnit differs from the dispatch's", () => {
			expect(
				isDiscrepancyRowCoveredByFixDispatch(
					overallRow({ temporalUnit: 'year' }),
					dispatch({ temporalUnit: 'month' })
				)
			).toBe(false);
		});
	});

	describe('period narrowing', () => {
		it('covers a row of any period when dispatch periods is omitted', () => {
			expect(
				isDiscrepancyRowCoveredByFixDispatch(
					overallRow({ period: '2030-06-01' }),
					dispatch()
				)
			).toBe(true);
		});

		it('covers a row whose period is included in dispatch periods', () => {
			expect(
				isDiscrepancyRowCoveredByFixDispatch(
					overallRow({ period: '2026-02-01' }),
					dispatch({ periods: ['2026-01-01', '2026-02-01'] })
				)
			).toBe(true);
		});

		it('excludes a row whose period is not included in dispatch periods', () => {
			expect(
				isDiscrepancyRowCoveredByFixDispatch(
					overallRow({ period: '2026-03-01' }),
					dispatch({ periods: ['2026-01-01', '2026-02-01'] })
				)
			).toBe(false);
		});

		it('ignores period narrowing for an all-time row with no period field', () => {
			expect(
				isDiscrepancyRowCoveredByFixDispatch(
					allTimeRow,
					dispatch({ temporalUnit: 'all-time', periods: ['2026-01-01'] })
				)
			).toBe(true);
		});
	});

	describe('species narrowing on an overall (non-species) row', () => {
		it('covers the row regardless of dispatch speciesIds, since the unnarrowed overall write pass always runs', () => {
			expect(
				isDiscrepancyRowCoveredByFixDispatch(
					overallRow(),
					dispatch({ periods: ['2026-01-01'], speciesIds: [7] })
				)
			).toBe(true);
		});
	});

	describe('species narrowing on a by-species row', () => {
		it('covers the row when dispatch speciesIds is omitted', () => {
			expect(
				isDiscrepancyRowCoveredByFixDispatch(bySpeciesRow(), dispatch())
			).toBe(true);
		});

		it("covers the row when dispatch speciesIds includes the row's species id", () => {
			expect(
				isDiscrepancyRowCoveredByFixDispatch(
					bySpeciesRow({ speciesId: 42 }),
					dispatch({ speciesIds: [7, 42] })
				)
			).toBe(true);
		});

		it("excludes the row when dispatch speciesIds is given and excludes the row's species id", () => {
			expect(
				isDiscrepancyRowCoveredByFixDispatch(
					bySpeciesRow({ speciesId: 42 }),
					dispatch({ speciesIds: [7] })
				)
			).toBe(false);
		});
	});
});
