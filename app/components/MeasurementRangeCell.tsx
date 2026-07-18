import type { MeasurementRange } from '@/app/models/measurement-range';

/**
 * Renders a summarised measurement range (see issue #377):
 * - empty        → blank cell
 * - single       → one value
 * - range        → "min - max"
 * - dominant endpoint → the matching endpoint is bold, e.g. **67** - 69
 * - dominant aside    → range followed by bold parenthesised value, e.g. 67 - 70 **(69)**
 */
export function MeasurementRangeCell({ range }: { range: MeasurementRange }) {
	if (range.kind === 'empty') {
		return null;
	}
	if (range.kind === 'single') {
		return <>{range.value}</>;
	}

	const { min, max } = range;
	const dominant = 'dominant' in range ? range.dominant : undefined;

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
