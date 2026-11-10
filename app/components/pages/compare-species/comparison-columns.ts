import {
	ageBlockEndBorder,
	ageBlockStartBorder,
	columnBlock
} from '@/modules/stats-view';
import { type ColumnConfig } from '@/modules/ui-kit';
import type { ComparisonRow } from '@/app/lib/compare-species';
import type {
	BiometricStatName,
	StatsCacheBySpeciesResult
} from '@/modules/stats/browser';

/**
 * Column definitions for the species-comparison page's two dataset tabs
 * (#115).
 *
 * Both tabs render the *same* `SimpleStatsCacheBySpecies` rows (#1412 — see
 * `fetchSpeciesComparisonStats`); what makes them two tabs is purely which
 * subset of that one row type each set below names. So the two column-name
 * unions are spelled out explicitly rather than derived from two row types:
 * with one row type there is nothing left for the compiler to tell them apart
 * by.
 *
 * Between them they cover every column of a cache row that carries
 * information in this context, bar:
 *
 * - `time_period` — always the all-time sentinel date, since every fetch here
 *   is ungrouped by time.
 * - `species_count` — always 1, since every fetch here is grouped by species.
 *
 * `species_name` stays in the configs (it's the first column, and the table's
 * default sort), but the table body renders it itself as a link rather than
 * through a formatter.
 */

/**
 * Constrains a column-name union to the keys a comparison row actually has, so
 * a typo'd or renamed column fails to compile. Deliberately a constraint
 * rather than `Extract<...>`/an intersection, which would silently narrow an
 * unknown name away instead of rejecting it.
 */
type ComparisonColumnNames<
	Names extends keyof ComparisonRow<StatsCacheBySpeciesResult>
> = Names;

/** The counts/effort half of a cache row — the "Core stats" tab's columns. */
type CoreComparisonColumnName = ComparisonColumnNames<
	| 'species_name'
	| 'session_count'
	| 'bird_count'
	| 'encounter_count'
	| 'new_bird_count'
	| 'max_per_session'
	| 'max_new_per_session'
	| 'pullus_bird_count'
	| 'juv_bird_count'
	| 'postjuv_bird_count'
	| 'adult_bird_count'
	| 'unknown_age_bird_count'
	| 'pullus_enc_count'
	| 'juv_enc_count'
	| 'postjuv_enc_count'
	| 'adult_enc_count'
	| 'unknown_age_enc_count'
>;

/**
 * The wing/weight half — the 8 names reused from `modules/stats`'
 * `BiometricStatName` rather than restated here, so a column added to or
 * removed from that family flows straight through to this tab.
 */
type BiometricsComparisonColumnName = ComparisonColumnNames<
	'species_name' | BiometricStatName
>;

// A dataset row genuinely missing a value (no biometric-eligible encounters for
// that species) renders as an em dash rather than an empty cell, so a blank
// reads as "no data" instead of as a rendering slip.
const MISSING_VALUE = '—';

function formatCount(value: unknown): string {
	return typeof value === 'number' ? String(value) : MISSING_VALUE;
}

function formatMeasurement(value: unknown): string {
	return typeof value === 'number'
		? String(Number(value.toFixed(1)))
		: MISSING_VALUE;
}

const speciesNameColumn: ColumnConfig = {
	label: 'Species',
	preferSortAscending: true
};

// Exhaustive over its own union rather than `Partial<>`: dropping a column
// from the record is then a compile error instead of a silently shorter table.
export const coreStatsComparisonColumns: Record<
	CoreComparisonColumnName,
	ColumnConfig
> = {
	species_name: speciesNameColumn,
	session_count: { label: 'Sessions', formatter: formatCount },
	bird_count: { label: 'Birds', formatter: formatCount },
	encounter_count: { label: 'Encounters', formatter: formatCount },
	new_bird_count: {
		label: 'New',
		formatter: formatCount,
		...columnBlock('green')
	},
	max_per_session: { label: 'Busiest session', formatter: formatCount },
	max_new_per_session: {
		label: 'Most new in a session',
		formatter: formatCount
	},
	// Bird-level age block, then the encounter-level one — same colours and
	// block borders the summary/period totals tables use, so the two blocks read
	// as the same five categories counted two ways.
	pullus_bird_count: {
		label: 'Pulli',
		formatter: formatCount,
		...columnBlock('cyan', ageBlockStartBorder)
	},
	juv_bird_count: {
		label: 'Juv',
		formatter: formatCount,
		...columnBlock('sky')
	},
	postjuv_bird_count: {
		label: 'Postjuv',
		formatter: formatCount,
		...columnBlock('blue')
	},
	adult_bird_count: {
		label: 'Adult',
		formatter: formatCount,
		...columnBlock('purple')
	},
	unknown_age_bird_count: {
		label: 'Not aged',
		formatter: formatCount,
		...columnBlock('taupe', ageBlockEndBorder)
	},
	pullus_enc_count: {
		label: 'Pulli encounters',
		formatter: formatCount,
		...columnBlock('cyan', ageBlockStartBorder)
	},
	juv_enc_count: {
		label: 'Juv encounters',
		formatter: formatCount,
		...columnBlock('sky')
	},
	postjuv_enc_count: {
		label: 'Postjuv encounters',
		formatter: formatCount,
		...columnBlock('blue')
	},
	adult_enc_count: {
		label: 'Adult encounters',
		formatter: formatCount,
		...columnBlock('purple')
	},
	unknown_age_enc_count: {
		label: 'Not aged encounters',
		formatter: formatCount,
		...columnBlock('taupe', ageBlockEndBorder)
	}
};

export const biometricsComparisonColumns: Record<
	BiometricsComparisonColumnName,
	ColumnConfig
> = {
	species_name: speciesNameColumn,
	min_weight: { label: 'Min weight (g)', formatter: formatMeasurement },
	avg_weight: { label: 'Avg weight (g)', formatter: formatMeasurement },
	median_weight: { label: 'Median weight (g)', formatter: formatMeasurement },
	max_weight: { label: 'Max weight (g)', formatter: formatMeasurement },
	min_wing: { label: 'Min wing (mm)', formatter: formatMeasurement },
	avg_wing: { label: 'Avg wing (mm)', formatter: formatMeasurement },
	median_wing: { label: 'Median wing (mm)', formatter: formatMeasurement },
	max_wing: { label: 'Max wing (mm)', formatter: formatMeasurement }
};
