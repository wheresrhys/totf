export class CasualtyEncounterError extends Error {
	constructor() {
		super('Casualty encounters are not to be imported');
		this.name = 'CasualtyEncounterError';
	}
}

// '-' is DemOn's own sentinel for "no ring number" on a casualty row (confirmed
// against a real export row) — not a guess, so don't extend this to other
// placeholder values without the same kind of evidence.
export function isRinglessRingNo(ring_no: string | null | undefined): boolean {
	const trimmed = ring_no?.trim();
	return !trimmed || trimmed === '-';
}

export function transformEmptyStringsToNull(
	obj: Record<string, unknown>
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(obj).map(([key, value]) => {
			if (typeof value === 'string') {
				const trimmed = value.trim();
				return [key, trimmed === '' ? null : trimmed];
			}
			return [key, value];
		})
	);
}

export function convertDateFormat(dateString: string): string {
	return dateString.split('/').reverse().join('-');
}

// Matches 'H:MM' or 'H:MM:SS'. Anything else is passed through unchanged.
const CAPTURE_TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

export function normaliseCaptureTime(rawCaptureTime: string): string {
	const match = CAPTURE_TIME_PATTERN.exec(rawCaptureTime.trim());
	if (!match) return rawCaptureTime;
	const [, hours, minutes, seconds = '00'] = match;
	return `${hours.padStart(2, '0')}:${minutes}:${seconds}`;
}
