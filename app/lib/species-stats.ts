import type {
	AggregateStatsResult,
	BiometricFieldName,
	BiometricsStatsResult
} from '../models/db';

// Re-exported for existing importers; the canonical definition (the 8 wing/weight
// columns biometrics_stats owns) now lives in db.ts alongside the other merge
// plumbing (#827).
export type { BiometricFieldName };

// The /species list page's row shape (#823): every non-biometric column from
// aggregate_stats, plus the 8 biometric columns sourced from biometrics_stats.
// aggregate_stats no longer carries its own copies (#827 removed them), so
// biometrics_stats is the sole source. A species with no matching
// biometrics_stats row leaves the 8 fields undefined, which
// MultiSpeciesTableBody's generic `<td>{species[column.property]}</td>` already
// renders as a blank cell — no special-casing needed.
export type SpeciesStatsRow = Omit<AggregateStatsResult, BiometricFieldName> &
	Partial<Pick<BiometricsStatsResult, BiometricFieldName>>;

// Joins aggregate_stats rows (species_name, bird_count, encounter_count, etc.)
// with biometrics_stats rows (the 8 wing/weight metrics) by species_name, keyed
// off the union of species present in either result set. biometrics_stats is the
// sole source for the 8 biometric fields (#827 removed aggregate_stats' own
// copies).
export function mergeSpeciesBiometrics(
	aggregateRows: AggregateStatsResult[],
	biometricsRows: BiometricsStatsResult[]
): SpeciesStatsRow[] {
	const aggregateByName = new Map(
		aggregateRows.map((row) => [row.species_name, row])
	);
	const biometricsByName = new Map(
		biometricsRows.map((row) => [row.species_name, row])
	);
	const speciesNames = [
		...new Set([...aggregateByName.keys(), ...biometricsByName.keys()])
	];

	return speciesNames.map((speciesName) => {
		const aggregateRow = aggregateByName.get(speciesName);
		const biometricsRow = biometricsByName.get(speciesName);
		return {
			...(aggregateRow ?? ({} as AggregateStatsResult)),
			species_name: speciesName,
			max_weight: biometricsRow?.max_weight,
			avg_weight: biometricsRow?.avg_weight,
			min_weight: biometricsRow?.min_weight,
			median_weight: biometricsRow?.median_weight,
			max_wing: biometricsRow?.max_wing,
			avg_wing: biometricsRow?.avg_wing,
			min_wing: biometricsRow?.min_wing,
			median_wing: biometricsRow?.median_wing
		};
	});
}

export type SpeciesStatConfig = {
	label: string;
	property: keyof SpeciesStatsRow;
	suffix?: string;
	category?: string;
	prefix?: string;
	preferSortAscending?: boolean;
};

export const speciesStatConfigs: SpeciesStatConfig[] = [
	{
		label: 'Species',
		property: 'species_name',
		preferSortAscending: true
	},
	{
		label: 'Birds',
		property: 'bird_count',
		category: 'Totals',
		suffix: 'birds'
	},
	{
		label: 'Encounters',
		property: 'encounter_count',
		category: 'Totals',
		suffix: 'encounters'
	},
	{
		label: 'Sessions',
		property: 'session_count',
		category: 'Totals',
		suffix: 'sessions'
	},
	{
		label: 'Max per session',
		property: 'max_per_session',
		category: 'Totals',
		prefix: 'max haul:',
		suffix: 'birds'
	},

	// {
	// 	label: '% Birds retrapped',
	// 	property: 'pct_retrapped',
	// 	category: 'Recoveries',
	// 	suffix: '% retrapped'
	// },
	// {
	// 	label: 'Max time span',
	// 	property: 'max_time_span_days',
	// 	category: 'Recoveries',
	// 	prefix: 'max time span:',
	// 	suffix: 'days'
	// },
	// {
	// 	label: 'Max proven age',
	// 	property: 'max_proven_age',
	// 	category: 'Recoveries',
	// 	prefix: 'max proven age:',
	// 	suffix: 'years'
	// },
	// {
	// 	label: 'Most caught bird',
	// 	property: 'max_encountered_bird',
	// 	category: 'Recoveries',
	// 	prefix: 'most seen bird:',
	// 	suffix: 'times'
	// },
	{
		label: 'Max weight',
		property: 'max_weight',
		suffix: 'g',
		category: 'Weight',
		prefix: 'max:'
	},
	{
		label: 'Avg weight',
		property: 'avg_weight',
		suffix: 'g',
		category: 'Weight',
		prefix: 'avg:'
	},
	{
		label: 'Min weight',
		property: 'min_weight',
		suffix: 'g',
		category: 'Weight',
		prefix: 'min:'
	},
	{
		label: 'Median weight',
		property: 'median_weight',
		suffix: 'g',
		category: 'Weight',
		prefix: 'median:'
	},
	{
		label: 'Max wing',
		property: 'max_wing',
		suffix: 'mm',
		category: 'Wing',
		prefix: 'max:'
	},
	{
		label: 'Avg wing',
		property: 'avg_wing',
		suffix: 'mm',
		category: 'Wing',
		prefix: 'avg:'
	},
	{
		label: 'Min wing',
		property: 'min_wing',
		suffix: 'mm',
		category: 'Wing',
		prefix: 'min:'
	},
	{
		label: 'Median wing',
		property: 'median_wing',
		suffix: 'mm',
		category: 'Wing',
		prefix: 'median:'
	}
];
