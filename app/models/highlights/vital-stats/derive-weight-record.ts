import {
	getScopeMatcher,
	RECORD_SCOPES
} from '@/app/models/highlights/shared/record-scope';
import {
	resolvePlacement,
	type Placement
} from '@/app/models/highlights/shared/placement';
import type { SessionStatsData } from '@/app/models/highlights/shared/session-stats';
import { WEIGHT_RECORD_EXTREMES, type WeightRecordHighlight } from './types';

// Minimum number of weighed encounters across other days for a species
// before a weight placement is worth reporting
const MIN_WEIGHED_ENCOUNTERS_FOR_RECORD = 3;

// Ranks the session's extreme against every other day's extreme (heaviest =
// larger is better, lightest = smaller is better). Returns null when the
// session doesn't make the top 3. The rank counts how many other days hold a
// strictly better extreme, so ties share a rank. A joint 3rd is suppressed —
// it merely repeats a lesser record; joint 1st/2nd are still worth reporting.
function deriveWeightPlacement(
	sessionWeight: number,
	otherWeights: number[],
	isHeaviest: boolean
): Placement | null {
	const isBetter = (candidate: number, reference: number) =>
		isHeaviest ? candidate > reference : candidate < reference;
	const betterDays = otherWeights.filter((weight) =>
		isBetter(weight, sessionWeight)
	).length;
	return resolvePlacement(betterDays, otherWeights.includes(sessionWeight));
}

// A species' heaviest/lightest bird this session is ranked against every other
// day in scope it was weighed, including later days (which can demote a
// placement). A placement needs the species to have been weighed at least three
// times across those other days in scope.
//
// All-time reports the full top-three placements. The this-year scope turns on
// once the species has crossed the same weighed-encounter threshold within the
// year, but reports only a first place — a heaviest/lightest of the year is
// worth a line, a lesser within-year placement is not.
export function deriveWeightRecordBreakers({
	date,
	stats,
	today = new Date()
}: {
	date: string;
	stats: SessionStatsData;
	today?: Date;
}): WeightRecordHighlight[] {
	const sessionDate = new Date(date);
	const sessionRows = stats.daySpeciesStats.filter(
		(row) => row.visit_date === date && row.weighed_birds_count > 0
	);
	if (sessionRows.length === 0) return [];

	const sharedFields = {
		year: sessionDate.getFullYear(),
		isCurrentYear: sessionDate.getFullYear() === today.getFullYear()
	};

	const highlights: WeightRecordHighlight[] = [];
	for (const sessionRow of sessionRows) {
		for (const scope of RECORD_SCOPES) {
			const scopeMatcher = getScopeMatcher(scope, sessionDate);
			const otherWeighedRows = stats.daySpeciesStats.filter(
				(row) =>
					row.species_name === sessionRow.species_name &&
					row.visit_date !== date &&
					row.weighed_birds_count > 0 &&
					scopeMatcher(row.visit_date)
			);
			const otherWeighedEncounters = otherWeighedRows.reduce(
				(total, row) => total + row.weighed_birds_count,
				0
			);
			if (otherWeighedEncounters < MIN_WEIGHED_ENCOUNTERS_FOR_RECORD) continue;

			for (const extreme of WEIGHT_RECORD_EXTREMES) {
				const isHeaviest = extreme === 'heaviest';
				const sessionWeight = isHeaviest
					? sessionRow.max_weight
					: sessionRow.min_weight;
				const otherWeights = otherWeighedRows.map((row) =>
					isHeaviest ? row.max_weight : row.min_weight
				);
				const placement = deriveWeightPlacement(
					sessionWeight,
					otherWeights,
					isHeaviest
				);
				if (!placement) continue;
				// This-year only headlines an outright leader; lesser within-year
				// placements aren't worth a line.
				if (scope === 'this-year' && placement.placementRank !== 1) continue;
				highlights.push({
					type: 'weight-record',
					speciesName: sessionRow.species_name,
					scope,
					extreme,
					weight: sessionWeight,
					...placement,
					...sharedFields
				});
			}
		}
	}
	return highlights;
}
