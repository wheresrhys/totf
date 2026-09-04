import type { SessionStatsData } from '@/app/models/highlights/shared/session-stats';
import type { RareSpeciesHighlight } from './types';

// A species the group has recorded on very few session days ever is always
// worth a mention when it turns up again. Excludes first-ever appearances,
// which the first-ever highlight covers with more specific copy.
export const MAX_RARE_SPECIES_SESSION_DAYS = 3;

// Returns a highlight for each species in the session that the group has ever
// recorded on only a handful of session days (MAX_RARE_SPECIES_SESSION_DAYS or
// fewer, counting every day it appears before or after this session). A
// species seen for the first time this session is excluded — the first-ever
// highlight already covers it with more specific copy.
export function deriveRareSpecies({
	date,
	stats
}: {
	date: string;
	stats: SessionStatsData;
}): RareSpeciesHighlight[] {
	const sessionRows = stats.daySpeciesStats.filter(
		(row) => row.visit_date === date
	);
	if (sessionRows.length === 0) return [];

	return sessionRows
		.map((sessionRow) => {
			const speciesDays = new Set(
				stats.daySpeciesStats
					.filter((row) => row.species_name === sessionRow.species_name)
					.map((row) => row.visit_date)
			);
			return { sessionRow, speciesDays };
		})
		.filter(
			({ speciesDays }) =>
				speciesDays.size <= MAX_RARE_SPECIES_SESSION_DAYS &&
				// A species recorded on no earlier day is first-ever territory
				[...speciesDays].some((visitDate) => visitDate < date)
		)
		.map(({ sessionRow, speciesDays }) => ({
			type: 'rare-species' as const,
			speciesName: sessionRow.species_name,
			totalSessionDays: speciesDays.size
		}));
}
