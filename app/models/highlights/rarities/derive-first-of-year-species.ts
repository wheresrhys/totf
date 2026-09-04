import type { SessionStatsData } from '@/app/models/highlights/shared/session-stats';
import type { FirstOfYearSpeciesHighlight } from './types';

// Returns a highlight for each species seen for the first time this calendar
// year on this session. First-ever species are excluded (the broader
// first-ever highlight covers them). The first session of the year is the
// spring-arrival roll-call — every returning species is genuinely first of the
// year there, so those highlights are kept, not suppressed; the combine rule
// collapses the resulting list into a single "First A, B and C of the year"
// line.
export function deriveFirstOfYearSpecies({
	date,
	stats,
	today = new Date()
}: {
	date: string;
	stats: SessionStatsData;
	today?: Date;
}): FirstOfYearSpeciesHighlight[] {
	const sessionRows = stats.daySpeciesStats.filter(
		(row) => row.visit_date === date
	);
	if (sessionRows.length === 0) return [];
	const yearPrefix = `${date.slice(0, 4)}-`;
	const year = Number(date.slice(0, 4));
	return sessionRows
		.filter((sessionRow) => {
			const priorDates = stats.daySpeciesStats
				.filter(
					(row) =>
						row.species_name === sessionRow.species_name &&
						row.visit_date < date
				)
				.map((row) => row.visit_date);
			return (
				priorDates.length > 0 &&
				!priorDates.some((priorDate) => priorDate.startsWith(yearPrefix))
			);
		})
		.map((sessionRow) => ({
			type: 'first-of-year-species' as const,
			speciesName: sessionRow.species_name,
			year,
			isCurrentYear: year === today.getFullYear(),
			multipleIndividualsRecorded: sessionRow.encounter_count > 1,
			// The species' only records this calendar year — a later day in the
			// same year revokes this; prior-year records don't (they're what
			// makes it first-of-year rather than first-ever)
			isOnlyRecord: !stats.daySpeciesStats.some(
				(row) =>
					row.species_name === sessionRow.species_name &&
					row.visit_date !== date &&
					row.visit_date.startsWith(yearPrefix)
			)
		}));
}
