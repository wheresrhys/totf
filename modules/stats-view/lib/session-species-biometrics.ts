import type { SessionEncounter } from '@/app/models/session';
import type { SessionSpeciesBiometrics } from '../types';

// The four stats this module derives for one measurement family (weight or
// wing), all `null` when nothing in the set was measured.
type MeasurementSummary = {
	max: number | null;
	avg: number | null;
	min: number | null;
	median: number | null;
};

const EMPTY_SUMMARY: MeasurementSummary = {
	max: null,
	avg: null,
	min: null,
	median: null
};

// `PERCENTILE_CONT(0.5)` equivalent: the value at the midpoint of the sorted
// set, interpolating between the two straddling values when the midpoint falls
// between indices (i.e. for an even-length set, the average of the two middle
// values rather than either one outright) — matching what the SQL layer
// computes for the cached `median_weight`/`median_wing` columns.
function interpolatedMedian(sortedValues: number[]): number {
	const midpoint = (sortedValues.length - 1) / 2;
	const lowerIndex = Math.floor(midpoint);
	const upperIndex = Math.ceil(midpoint);
	return lowerIndex === upperIndex
		? sortedValues[lowerIndex]
		: (sortedValues[lowerIndex] + sortedValues[upperIndex]) / 2;
}

// Null-on-empty, not zero-on-empty: a set with no measured values returns
// `null` for every stat, mirroring the SQL-layer convention that
// `MAX`/`AVG`/`MIN`/`PERCENTILE_CONT` over an empty set genuinely returns
// `NULL` (see `modules/stats/CLAUDE.md`). Unmeasured entries are dropped
// rather than treated as zero, so each measurement family is summarised over
// only the encounters that actually carry it.
function summariseMeasurements(
	values: (number | null | undefined)[]
): MeasurementSummary {
	const measured = values.filter(
		(value): value is number => typeof value === 'number'
	);
	if (measured.length === 0) {
		return EMPTY_SUMMARY;
	}
	const sorted = [...measured].sort((a, b) => a - b);
	return {
		max: sorted[sorted.length - 1],
		avg: measured.reduce((sum, value) => sum + value, 0) / measured.length,
		min: sorted[0],
		median: interpolatedMedian(sorted)
	};
}

/**
 * Derives the 8 wing/weight biometric stats for a set of session encounters,
 * client-side from each encounter's raw `weight`/`wing_length` (#1431).
 *
 * `SessionSpeciesTotalsTable`'s rows are scoped by `capture_method`, a grain
 * the stats cache doesn't materialize, so there is no cached cell to read these
 * off — unlike every other table rendering the same 8 columns. Weight and wing
 * are summarised independently: an encounter weighed but not wing-measured
 * contributes to the weight stats only, and vice versa.
 *
 * Called per species row *and* once over every species' encounters flattened
 * together, for the table's session-wide totals row — a max/avg/min/median
 * can't be summed up from the per-species values, so the totals row
 * re-aggregates from scratch rather than reducing over the rows.
 */
export function deriveSessionSpeciesBiometrics(
	encounters: SessionEncounter[]
): SessionSpeciesBiometrics {
	const weight = summariseMeasurements(
		encounters.map((encounter) => encounter.weight)
	);
	const wing = summariseMeasurements(
		encounters.map((encounter) => encounter.wing_length)
	);
	return {
		max_weight: weight.max,
		avg_weight: weight.avg,
		min_weight: weight.min,
		median_weight: weight.median,
		max_wing: wing.max,
		avg_wing: wing.avg,
		min_wing: wing.min,
		median_wing: wing.median
	};
}
