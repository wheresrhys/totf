import { describe, it, expect } from 'vitest';
import {
	AccordionItem,
	AccordionTableBody,
	AggregateByToggle,
	CombineYearsToggle,
	ConditionalTabPanel,
	PageWrapper,
	PrimaryHeading,
	SecondaryHeading,
	Standfirst,
	BoxyList,
	defaultTableClassName,
	Table,
	InlineTable,
	BadgeList,
	UnwrappedBadgeList,
	printLocationName,
	EmptyMonthsToggle,
	NoPrefetchLink,
	RingSearchForm,
	getFormattedValue,
	SortableTable,
	getPlural,
	getSpaceForUnit,
	StatOutput,
	createStatsTableBody,
	ageBlockStartBorder,
	ageBlockEndBorder,
	columnBlock,
	createNameLinkCell,
	buildStandardColumnConfigs,
	buildTotalsRowCells,
	TabContent,
	TabSet,
	TemporalFilterControls,
	useLinkableTabs
} from '@/modules/ui-kit';
// Type-only exports have no runtime presence to assert on — importing them
// here still means a type removed from the barrel fails `npm run type:check`
// (tsc's program follows this import), the same regression this test guards
// against for the value exports below.
import type {
	AggregateByValue,
	SpeciesName,
	StatUnit,
	StatOutputModel,
	StatsTableBodyConfig,
	TotalsRowCellsInput,
	TabConfig,
	TabConfigInSet,
	TabSetTabConfig,
	TemporalNavigationTarget,
	ColumnConfig,
	RowModelWithRawData
} from '@/modules/ui-kit';

// Regression guard for the barrel itself (#1326): every name previously
// importable from some `app/components/shared/<File>` must stay importable
// from the single `@/modules/ui-kit` barrel. This matters beyond this
// ticket — `modules/stats-view` (a follow-up module) builds directly on
// `SortableTable`/`StatsTableColumnConfigs`'s exports from here.
describe('modules/ui-kit barrel', () => {
	it('re-exports every component, hook, type, and constant previously importable from app/components/shared/*', () => {
		expect(AccordionItem).toBeDefined();
		expect(AccordionTableBody).toBeDefined();
		expect(AggregateByToggle).toBeDefined();
		expect(CombineYearsToggle).toBeDefined();
		expect(ConditionalTabPanel).toBeDefined();
		expect(PageWrapper).toBeDefined();
		expect(PrimaryHeading).toBeDefined();
		expect(SecondaryHeading).toBeDefined();
		expect(Standfirst).toBeDefined();
		expect(BoxyList).toBeDefined();
		expect(defaultTableClassName).toBe('table table-xs sm:table-md');
		expect(Table).toBeDefined();
		expect(InlineTable).toBeDefined();
		expect(BadgeList).toBeDefined();
		expect(UnwrappedBadgeList).toBeDefined();
		expect(printLocationName).toBeDefined();
		expect(EmptyMonthsToggle).toBeDefined();
		expect(NoPrefetchLink).toBeDefined();
		expect(RingSearchForm).toBeDefined();
		expect(getFormattedValue).toBeDefined();
		expect(SortableTable).toBeDefined();
		expect(getPlural).toBeDefined();
		expect(getSpaceForUnit).toBeDefined();
		expect(StatOutput).toBeDefined();
		expect(createStatsTableBody).toBeDefined();
		expect(ageBlockStartBorder).toBeDefined();
		expect(ageBlockEndBorder).toBeDefined();
		expect(columnBlock).toBeDefined();
		expect(createNameLinkCell).toBeDefined();
		expect(buildStandardColumnConfigs).toBeDefined();
		expect(buildTotalsRowCells).toBeDefined();
		expect(TabContent).toBeDefined();
		expect(TabSet).toBeDefined();
		expect(TemporalFilterControls).toBeDefined();
		expect(useLinkableTabs).toBeDefined();
	});

	// Type-only exports have no runtime presence `expect` can assert on. The
	// `import type` above already does the equivalent check: if any of these
	// names stopped being exported from the barrel, `tsc` would fail with
	// "has no exported member" on that import line alone, regardless of
	// whether the type is referenced afterwards. This alias exists only to
	// give that import a reference, satisfying the unused-import lint rule.
	type BarrelTypeExistenceCheck = [
		AggregateByValue,
		SpeciesName,
		StatUnit,
		StatOutputModel,
		StatsTableBodyConfig<unknown, unknown>,
		TotalsRowCellsInput<{ total: number }>,
		TabConfig<unknown, unknown>,
		TabConfigInSet<unknown, unknown, TabConfig<unknown, unknown>>,
		TabSetTabConfig<unknown, unknown>,
		TemporalNavigationTarget,
		ColumnConfig,
		RowModelWithRawData<unknown, unknown>
	];
	it('type-checks every type-only export referenced above', () => {
		const check: BarrelTypeExistenceCheck | undefined = undefined;
		expect(check).toBeUndefined();
	});
});
