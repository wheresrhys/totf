/**
 * Parse PostgreSQL interval strings returned by PostgREST (e.g. "1 day 02:30:00", "02:15:00").
 */
export function postgresIntervalToSeconds(raw: string): number {
	if (raw === '') return 0;
	const s = raw.trim();
	if (s === '00:00:00') return 0;

	let total = 0;
	const dayMatch = s.match(/(\d+)\s+days?/i);
	if (dayMatch) {
		total += parseInt(dayMatch[1], 10) * 86400;
	}

	const timeMatch = s.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
	if (timeMatch) {
		total +=
			parseInt(timeMatch[1], 10) * 3600 +
			parseInt(timeMatch[2], 10) * 60 +
			parseFloat(timeMatch[3]);
	}

	return total;
}

export function postgresIntervalToHours(raw: string): number {
	return postgresIntervalToSeconds(raw) / 3600;
}

export function postgresIntervalToMinutes(raw: string): number {
	return postgresIntervalToSeconds(raw) / 60;
}

/** Readable duration for tables (hours/minutes; sub-minute uses seconds). */
export function formatPostgresIntervalForDisplay(raw: string): string {
	const sec = postgresIntervalToSeconds(raw);
	if (sec === 0) return '0';
	if (sec < 60) return `${Math.round(sec)}s`;
	const h = Math.floor(sec / 3600);
	const m = Math.floor((sec % 3600) / 60);
	if (h === 0) return `${m}m`;
	if (m === 0) return `${h}h`;
	return `${h}h ${m}m`;
}
