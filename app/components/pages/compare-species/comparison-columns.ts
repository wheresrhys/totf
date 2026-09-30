import type { ColumnConfig } from '@/app/components/shared/SortableTable';
import {
	ageBlockEndBorder,
	ageBlockStartBorder,
	columnBlock
} from '@/app/components/shared/StatsTableColumnConfigs';
import { formatPostgresIntervalForDisplay } from '@/app/lib/postgres-interval';
import type { ComparisonRow } from '@/app/lib/compare-species';
import type {
	BiometricsStatsResult,
	CoreStatsResult,
	DemographicsStatsResult
} from '@/app/models/db';

/**
 * Column definitions for the species-comparison page's three tables (#115).
 *
 * The ticket asks for "all available columns for those datasets", so each set
 * below is its RPC's composite type in full, bar two kinds of column that
 * carry no information in this context:
 *
 * - `time_period` — always null, since every fetch here is ungrouped by time.
 * - `species_count` (core_stats only) — always 1, since every fetch here is
 *   grouped by species.
 *
 * `species_name` stays in the configs (it's the first column, and the table's
 * default sort), but the table body renders it itself as a link rather than
 * through a formatter.
 */

// A dataset row genuinely missing a value (no biometric-eligible encounters for
// that species) renders as an em dash rather than an empty cell, so a blank
// reads as "no data" instead of as a rendering slip.
const MISSING_VALUE = '—';

function formatCount(value: unknown): string {
	return typeof value === 'number' ? String(value) : MISSING_VALUE;
}

// Postgres intervals arrive as strings ("02:00:00", "1 day 02:30:00").
function formatInterval(value: unknown): string {
	return typeof value === 'string' && value !== ''
		? formatPostgresIntervalForDisplay(value)
		: MISSING_VALUE;
}

// `Number(x.toFixed(n))` rather than the string `toFixed` gives: trailing
// zeroes are dropped, so an exact 2 shows as "2" and not "2.00".
function formatRate(value: unknown): string {
	return typeof value === 'number'
		? String(Number(value.toFixed(2)))
		: MISSING_VALUE;
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

export const coreStatsComparisonColumns: Partial<
	Record<keyof ComparisonRow<CoreStatsResult>, ColumnConfig>
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
	avg_encounters_per_session: {
		label: 'Avg per session',
		formatter: formatRate
	},
	total_effort: { label: 'Total effort', formatter: formatInterval },
	effort_per_session: { label: 'Effort / session', formatter: formatInterval },
	effort_per_encounter: {
		label: 'Effort / encounter',
		formatter: formatInterval
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
		label: 'Pulli (enc)',
		formatter: formatCount,
		...columnBlock('cyan', ageBlockStartBorder)
	},
	juv_enc_count: {
		label: 'Juv (enc)',
		formatter: formatCount,
		...columnBlock('sky')
	},
	postjuv_enc_count: {
		label: 'Postjuv (enc)',
		formatter: formatCount,
		...columnBlock('blue')
	},
	adult_enc_count: {
		label: 'Adult (enc)',
		formatter: formatCount,
		...columnBlock('purple')
	},
	unknown_age_enc_count: {
		label: 'Not aged (enc)',
		formatter: formatCount,
		...columnBlock('taupe', ageBlockEndBorder)
	}
};

export const biometricsComparisonColumns: Partial<
	Record<keyof ComparisonRow<BiometricsStatsResult>, ColumnConfig>
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

// Labels follow the wording the species page's Demographics tab already uses
// for the same columns (see `StatsHistoryChart.tsx`), and spell out the two
// overlapping juv definitions `demographics_stats` exposes: `juv_enc_count`
// combines 1J and 3J, `postjuv_juv_enc_count` is the 3J-only slice.
export const demographicsComparisonColumns: Partial<
	Record<keyof ComparisonRow<DemographicsStatsResult>, ColumnConfig>
> = {
	species_name: speciesNameColumn,
	adult_bird_count: { label: 'Adults', formatter: formatCount },
	new_adult_bird_count: { label: 'New adults', formatter: formatCount },
	juv_bird_count: { label: 'Young birds', formatter: formatCount },
	new_young_bird_count: { label: 'New young', formatter: formatCount },
	returning_age_1_bird_count: {
		label: 'Returning: 1 year',
		formatter: formatCount
	},
	returning_age_2_bird_count: {
		label: 'Returning: 2 years',
		formatter: formatCount
	},
	returning_age_3_plus_bird_count: {
		label: 'Returning: 3+ years',
		formatter: formatCount
	},
	returning_new_unknown_age_bird_count: {
		label: 'Returning: unknown age',
		formatter: formatCount
	},
	juv_enc_count: { label: 'Juv encounters (1J+3J)', formatter: formatCount },
	postjuv_juv_enc_count: {
		label: 'Juv encounters (3J)',
		formatter: formatCount
	},
	new_postjuv_juv_enc_count: {
		label: 'New juv encounters (3J)',
		formatter: formatCount
	},
	postjuv_enc_count: { label: 'Postjuv encounters', formatter: formatCount },
	new_postjuv_enc_count: {
		label: 'New postjuv encounters',
		formatter: formatCount
	}
};
