/**
 * Pure logic for summarising a bird's measurements (wing length, weight) as a
 * range for display on the single-species bird list.
 *
 * See issue #377.
 */

// Every set of measurements maps to a range (min/max); a single measurement, or
// several equal ones, is simply a range where min === max. Collapsing that to a
// lone value is a presentational decision (see MeasurementRangeCell), not a
// property of the data. A dominant value falling outside [min, max] is
// impossible, so `dominant` only ever equals an endpoint (emphasised endpoint) or
// sits strictly between them (aside).
export type MeasurementRange = {
	min: number;
	max: number;
	dominant?: number;
};

/**
 * Filters an encounter's raw measurement values down to the numbers actually
 * recorded (dropping null/undefined).
 */
function collectMeasurements(
	values: readonly (number | null | undefined)[]
): number[] {
	return values.filter((value): value is number => typeof value === 'number');
}

/**
 * The dominant value is the median, but only when the majority (strictly more
 * than half) of the records equal it. Returns null when there is no such value.
 */
function findDominantValue(measurements: number[]): number | null {
	const sorted = [...measurements].sort((a, b) => a - b);
	const median = sorted[Math.floor((sorted.length - 1) / 2)];
	const matchingCount = sorted.filter((value) => value === median).length;
	return matchingCount * 2 > sorted.length ? median : null;
}

/**
 * Summarises a set of measurement values as a range. Returns null when no
 * measurements were recorded (there is no range to describe). When
 * `withDominant` is true (used for wing length), a dominant value is attached
 * where one exists.
 */
export function deriveMeasurementRange(
	values: readonly (number | null | undefined)[],
	{ withDominant = false }: { withDominant?: boolean } = {}
): MeasurementRange | null {
	const measurements = collectMeasurements(values);
	if (measurements.length === 0) {
		return null;
	}
	const range: MeasurementRange = {
		min: Math.min(...measurements),
		max: Math.max(...measurements)
	};
	if (withDominant) {
		const dominant = findDominantValue(measurements);
		if (dominant !== null) {
			range.dominant = dominant;
		}
	}
	return range;
}
