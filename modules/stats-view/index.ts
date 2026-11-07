// The single barrel for this module — re-exports only, no logic of its own.
// `MONTH_ABBREVIATIONS` (lib/squashed-month.ts) is deliberately absent: it has
// no caller outside the module, the same "module-internal only" treatment
// `modules/stats` gives `runSimpleStatsCacheRefreshPass`.
export * from './types';
export {
	derivePeriodTotalsRowByBird,
	derivePeriodTotalsRowByEncounter,
	formatPeriodTotalsLabel
} from './lib/period-totals';
export {
	calculateEncounterRetraps,
	calculateRetraps,
	deriveSpeciesTotalsRow,
	deriveSpeciesTotalsRowByEncounter
} from './lib/species-totals';
export {
	mergeSpeciesBiometrics,
	speciesStatConfigs
} from './lib/species-stats';
export {
	buildGroupSquashedMonthSummaryHref,
	buildSpeciesSquashedMonthHref,
	formatMonthAbbreviation,
	parseMonthAbbreviation
} from './lib/squashed-month';
export {
	AggregateByToggle,
	type AggregateByValue
} from './lib/AggregateByToggle';
export { CombineYearsToggle } from './lib/CombineYearsToggle';
export { EmptyMonthsToggle } from './lib/EmptyMonthsToggle';
export {
	createStatsTableBody,
	type StatsTableBodyConfig
} from './lib/StatsTableBody';
export {
	ageBlockStartBorder,
	ageBlockEndBorder,
	columnBlock,
	createNameLinkCell,
	buildStandardColumnConfigs,
	buildTotalsRowCells,
	type TotalsRowCellsInput
} from './lib/StatsTableColumnConfigs';
export { PeriodTotalsTable } from './components/PeriodTotalsTable';
export {
	SpeciesTotalsTable,
	type SpeciesPeriod
} from './components/SpeciesTotalsTable';
export { SessionSpeciesTotalsTable } from './components/SessionSpeciesTotalsTable';
export { SppStatsTable } from './components/SppStatsTable';
export { SpTable } from './components/SpTable';
