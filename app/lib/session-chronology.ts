import type { SessionEncounter } from '../models/session';
import { isMistNetEncounter } from '../models/encounter';

// Matches SQL: GREATEST(MAX(capture_time) - MIN(capture_time), '02:00:00') in core_stats RPC.
// That 2h floor applies to effort calculations only — display uses actual duration.
export const SESSION_MINIMUM_EFFORT_MINUTES = 120;

export const NET_ROUND_GAP_MINUTES = 15;

export type NetRound = {
	startTime: string;
	encounters: SessionEncounter[];
};

export type SessionChronology = {
	startTime: string | null;
	endTime: string | null;
	durationMinutes: number | null;
	netRounds: NetRound[];
};

function timeToMinutes(time: string): number {
	const [h, m] = time.split(':').map(Number);
	return h * 60 + m;
}

// Net rounds are a mist-netting concept — a non-mist-net catch (hand-caught,
// box trap, etc, #1022) isn't checked on a round schedule, so it's excluded
// from the chronology before any of the grouping below runs.
export function calculateSessionChronology(
	encounters: SessionEncounter[]
): SessionChronology {
	const mistNetEncounters = encounters.filter(isMistNetEncounter);
	const timedEncounters = mistNetEncounters.filter((e) => e.capture_time);

	if (timedEncounters.length === 0) {
		return {
			startTime: null,
			endTime: null,
			durationMinutes: null,
			netRounds: []
		};
	}

	const sorted = [...timedEncounters].sort((a, b) =>
		a.capture_time!.localeCompare(b.capture_time!)
	);

	const startTime = sorted[0].capture_time!;
	const endTime = sorted[sorted.length - 1].capture_time!;
	const durationMinutes = timeToMinutes(endTime) - timeToMinutes(startTime);

	const netRounds: NetRound[] = [];
	let currentRoundStart: string | null = null;

	for (const encounter of sorted) {
		const t = encounter.capture_time!;
		if (
			currentRoundStart === null ||
			timeToMinutes(t) - timeToMinutes(currentRoundStart) >=
				NET_ROUND_GAP_MINUTES
		) {
			netRounds.push({ startTime: t, encounters: [encounter] });
			currentRoundStart = t;
		} else {
			netRounds[netRounds.length - 1].encounters.push(encounter);
		}
	}

	return { startTime, endTime, durationMinutes, netRounds };
}
