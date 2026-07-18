/**
 * Pure logic for summarising a bird's measurements (wing length, weight) as a
 * range for display on the single-species bird list.
 *
 * See issue #377.
 */

export type MeasurementRange =
	| { kind: 'empty' }
	| { kind: 'single'; value: number }
	| { kind: 'range'; min: number; max: number }
	// A range with a dominant value that falls outside [min, max] is impossible,
	// so a dominant value is only ever attached to a range when it equals one of
	// the endpoints (emphasised endpoint) or sits strictly between them (aside).
	| { kind: 'range'; min: number; max: number; dominant: number };

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
 * Summarises a set of measurement values as a range for display. When
 * `withDominant` is true (used for wing length), a dominant value is attached
 * to ranges where one exists.
 */
export function deriveMeasurementRange(
	values: readonly (number | null | undefined)[],
	{ withDominant = false }: { withDominant?: boolean } = {}
): MeasurementRange {
	const measurements = collectMeasurements(values);
	if (measurements.length === 0) {
		return { kind: 'empty' };
	}
	const min = Math.min(...measurements);
	const max = Math.max(...measurements);
	if (min === max) {
		return { kind: 'single', value: min };
	}
	if (withDominant) {
		const dominant = findDominantValue(measurements);
		if (dominant !== null) {
			return { kind: 'range', min, max, dominant };
		}
	}
	return { kind: 'range', min, max };
}
