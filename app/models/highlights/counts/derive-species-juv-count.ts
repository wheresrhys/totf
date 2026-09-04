import { differenceInYears } from 'date-fns';
import {
	getScopeMatcher,
	RECORD_SCOPES
} from '@/app/models/highlights/shared/record-scope';
import type { SessionStatsData } from '@/app/models/highlights/shared/session-stats';
import type { SpeciesJuvCountRecordHighlight } from './types';
import { deriveAllTimePlacement } from './derive-species-count';

// A per-species juvenile count is only worth a "most juvs" line once it clears
// this threshold — the session must have caught strictly more than this many
// juveniles of the species (i.e. 5+) for a highlight to be produced.
export const MIN_NOTABLE_JUV_COUNT = 4;

// The most juveniles of one species this session, ranked against every other
// day in scope. Mirrors deriveSpeciesRecords (same strict-record / all-time
// tie / 1st-2nd-3rd placement logic) over the 'juvs' measure, but gates on
// MIN_NOTABLE_JUV_COUNT rather than the single-bird rule — a handful of
// juveniles is common and unremarkable.
export function deriveSpeciesJuvRecords({
	date,
	stats,
	today = new Date()
}: {
	date: string;
	stats: SessionStatsData;
	today?: Date;
}): SpeciesJuvCountRecordHighlight[] {
	const sessionDate = new Date(date);
	const sessionRows = stats.daySpeciesStats.filter(
		(row) => row.visit_date === date
	);
	if (sessionRows.length === 0) return [];

	const sharedFields = {
		year: sessionDate.getFullYear(),
		isCurrentYear: sessionDate.getFullYear() === today.getFullYear()
	};

	const highlights: SpeciesJuvCountRecordHighlight[] = [];
	for (const sessionRow of sessionRows) {
		const { species_name: speciesName, juv_count: sessionValue } = sessionRow;
		// Only notable once the session clears the juvenile-count threshold
		if (sessionValue <= MIN_NOTABLE_JUV_COUNT) continue;
		for (const scope of RECORD_SCOPES) {
			const scopeMatcher = getScopeMatcher(scope, sessionDate);
			const otherRowsInScope = stats.daySpeciesStats.filter(
				(row) =>
					row.species_name === speciesName &&
					row.visit_date !== date &&
					scopeMatcher(row.visit_date)
			);
			// A record requires the species to appear on at least one other day
			if (otherRowsInScope.length === 0) continue;
			const bestOtherValue = Math.max(
				...otherRowsInScope.map((row) => row.juv_count)
			);
			const baseHighlight = {
				type: 'species-juv-count-record',
				speciesName,
				scope,
				value: sessionValue,
				...sharedFields
			} satisfies SpeciesJuvCountRecordHighlight;
			if (sessionValue > bestOtherValue) {
				highlights.push(baseHighlight);
				break;
			}
			if (sessionValue === bestOtherValue && scope === 'all-time') {
				// The for-N-years copy describes how long the record stood, so
				// only prior tied days count towards it; a tie held only by a
				// later day still reads as a joint best day
				const mostRecentPriorTieDate = otherRowsInScope
					.filter(
						(row) => row.juv_count === bestOtherValue && row.visit_date < date
					)
					.map((row) => row.visit_date)
					.sort()
					.at(-1);
				const recordEqualledYearsAgo =
					mostRecentPriorTieDate === undefined
						? 0
						: differenceInYears(sessionDate, new Date(mostRecentPriorTieDate));
				highlights.push(
					recordEqualledYearsAgo >= 1
						? { ...baseHighlight, recordEqualledYearsAgo }
						: { ...baseHighlight, placementRank: 1, isJointPlacement: true }
				);
				break;
			}
			if (scope === 'all-time') {
				const placement = deriveAllTimePlacement(
					sessionValue,
					otherRowsInScope.map((row) => row.juv_count)
				);
				if (placement) {
					highlights.push({ ...baseHighlight, ...placement });
					// no break — a narrower scope may still hold a strict record,
					// reported alongside the placement
				}
			}
			// beaten at this scope — a narrower scope may exclude the
			// offending day and still hold a strict record
		}
	}
	return highlights;
}
