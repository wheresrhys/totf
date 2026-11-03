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
export { mergeSpeciesBiometrics, speciesStatConfigs } from './lib/species-stats';
export {
	buildGroupSquashedMonthSummaryHref,
	buildSpeciesSquashedMonthHref,
	formatMonthAbbreviation,
	parseMonthAbbreviation
} from './lib/squashed-month';
export { PeriodTotalsTable } from './lib/components/PeriodTotalsTable';
export {
	SpeciesTotalsTable,
	type SpeciesPeriod
} from './lib/components/SpeciesTotalsTable';
export { SessionSpeciesTotalsTable } from './lib/components/SessionSpeciesTotalsTable';
export { SppStatsTable } from './lib/components/SppStatsTable';
export { SpTable } from './lib/components/SpTable';
