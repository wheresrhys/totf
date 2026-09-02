import type { MeasurementRange } from '@/app/models/measurement-range';

/**
 * Renders a summarised measurement range (see issue #377):
 * - null           → blank cell
 * - min === max    → the single value (collapsing the range is presentational)
 * - min < max      → "min - max"
 * - dominant endpoint → the matching endpoint is bold, e.g. **67** - 69
 * - dominant aside    → range followed by bold parenthesised value, e.g. 67 - 70 **(69)**
 */
export function MeasurementRangeCell({
	range
}: {
	range: MeasurementRange | null;
}) {
	if (range === null) {
		return null;
	}

	const { min, max, dominant } = range;

	if (min === max) {
		return <>{min}</>;
	}

	if (dominant === min) {
		return (
			<>
				<strong>{min}</strong> - {max}
			</>
		);
	}
	if (dominant === max) {
		return (
			<>
				{min} - <strong>{max}</strong>
			</>
		);
	}
	return (
		<>
			{min} - {max}
			{dominant !== undefined ? (
				<>
					{' '}
					<strong>({dominant})</strong>
				</>
			) : null}
		</>
	);
}
