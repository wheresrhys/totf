import type { SessionStatsData } from '@/app/models/highlights/shared/session-stats';
import type { FirstEverSpeciesHighlight } from './types';

// Returns a highlight for each species seen for the first time on this session.
// Suppressed entirely for the group's first-ever session (every species would
// be first, making the highlights uninformative).
export function deriveFirstEverSpecies({
	date,
	stats
}: {
	date: string;
	stats: SessionStatsData;
}): FirstEverSpeciesHighlight[] {
	const sessionRows = stats.daySpeciesStats.filter(
		(row) => row.visit_date === date
	);
	if (sessionRows.length === 0) return [];
	// Suppress on the group's first-ever session
	const priorSessionDates = stats.sessionDates.filter(
		(sessionDate) => sessionDate < date
	);
	if (priorSessionDates.length === 0) return [];
	// Find species with no appearance before this session
	return sessionRows
		.filter(
			(sessionRow) =>
				!stats.daySpeciesStats.some(
					(row) =>
						row.species_name === sessionRow.species_name &&
						row.visit_date < date
				)
		)
		.map((sessionRow) => {
			// The species' only records ever — later days revoke this, so a
			// "first ever" can lose its "only" copy as more data arrives
			const isOnlyRecord = !stats.daySpeciesStats.some(
				(row) =>
					row.species_name === sessionRow.species_name &&
					row.visit_date !== date
			);
			return {
				type: 'first-ever-species' as const,
				speciesName: sessionRow.species_name,
				multipleIndividualsRecorded: sessionRow.encounter_count > 1,
				isOnlyRecord
			};
		});
}
