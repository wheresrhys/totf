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

/**
 * `Encounters.capture_time` is a `time without time zone`, so Postgres stores
 * `'08:30'` and hands it back as `'08:30:00'`. Both forms used to be
 * interchangeable, because the only `capture_time`s this module ever compared
 * came from one CSV and were therefore formatted alike. Since #1219 the
 * reconciliation pass also compares a CSV row's `capture_time` against one read
 * back out of Postgres — to order a merge, and to tell a genuine duplicate from
 * a re-import of the same record — and `'08:30' < '08:30:00'` as strings, so
 * the two have to be written in one canonical form.
 *
 * Anything that doesn't parse is passed through untouched, exactly as before:
 * Postgres accepts several other time literals, and rejecting one here would
 * fail a row the importer used to accept.
 */
const CAPTURE_TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

export function normaliseCaptureTime(rawCaptureTime: string): string {
	const match = CAPTURE_TIME_PATTERN.exec(rawCaptureTime.trim());
	if (!match) return rawCaptureTime;
	const [, hours, minutes, seconds = '00'] = match;
	return `${hours.padStart(2, '0')}:${minutes}:${seconds}`;
}
