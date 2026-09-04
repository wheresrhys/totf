import { differenceInYears } from 'date-fns';
import {
	getScopeMatcher,
	RECORD_SCOPES
} from '@/app/models/highlights/shared/record-scope';
import {
	resolvePlacement,
	type Placement
} from '@/app/models/highlights/shared/placement';
import type { SessionStatsData } from '@/app/models/highlights/shared/session-stats';
import type { SpeciesCountRecordHighlight } from './types';

// 2nd/3rd placements are only reported while the top tiers are sparsely
// held: 2nd place needs fewer than three other days at the top value, 3rd
// place needs fewer than three other days across the top two values. The
// session must also equal or exceed an included tier value — a count below
// every other value is not a placement, however thin the history.
//
// A 2nd place may be joint (tying other days is still notable, however many
// days share the value), but a 3rd place is only reported when it is unique —
// a joint 3rd merely repeats an already-lesser record and isn't worth a line.
//
// Shared with deriveSpeciesJuvRecords — both rank a per-species count value
// against every other day the same way ("higher is always better").
export function deriveAllTimePlacement(
	sessionValue: number,
	otherValues: number[]
): Placement | null {
	const distinctValuesDescending = [...new Set(otherValues)].sort(
		(a, b) => b - a
	);
	const [topValue, secondValue, thirdValue] = distinctValuesDescending;
	const daysAt = (value: number) =>
		otherValues.filter((otherValue) => otherValue === value).length;
	const includedValues = [topValue];
	if (secondValue !== undefined && daysAt(topValue) < 3) {
		includedValues.push(secondValue);
		if (
			thirdValue !== undefined &&
			daysAt(topValue) + daysAt(secondValue) < 3
		) {
			includedValues.push(thirdValue);
		}
	}
	const minIncludedValue = includedValues.at(-1)!;
	if (sessionValue < minIncludedValue || sessionValue >= topValue) return null;
	// The tier rule above means at most two other days can outrank a qualifying
	// value, so resolvePlacement always yields a 2nd or 3rd here (never 1st)
	const betterDays = otherValues.filter(
		(otherValue) => otherValue > sessionValue
	).length;
	return resolvePlacement(betterDays, otherValues.includes(sessionValue));
}

export function deriveSpeciesRecords({
	date,
	stats,
	today = new Date()
}: {
	date: string;
	stats: SessionStatsData;
	today?: Date;
}): SpeciesCountRecordHighlight[] {
	const sessionDate = new Date(date);
	const sessionRows = stats.daySpeciesStats.filter(
		(row) => row.visit_date === date
	);
	if (sessionRows.length === 0) return [];

	const sharedFields = {
		year: sessionDate.getFullYear(),
		isCurrentYear: sessionDate.getFullYear() === today.getFullYear()
	};

	const highlights: SpeciesCountRecordHighlight[] = [];
	for (const sessionRow of sessionRows) {
		const { species_name: speciesName, encounter_count: sessionValue } =
			sessionRow;
		// A single bird is never a notable count, whatever the history says
		if (sessionValue === 1) continue;
		for (const scope of RECORD_SCOPES) {
			const scopeMatcher = getScopeMatcher(scope, sessionDate);
			const otherRowsInScope = stats.daySpeciesStats.filter(
				(row) =>
					row.species_name === speciesName &&
					row.visit_date !== date &&
					scopeMatcher(row.visit_date)
			);
			// A record requires the species to appear on at least one other day
			// in scope (otherwise it's first-ever territory, covered elsewhere)
			if (otherRowsInScope.length === 0) continue;
			const bestOtherValue = Math.max(
				...otherRowsInScope.map((row) => row.encounter_count)
			);
			const baseHighlight = {
				type: 'species-count-record',
				speciesName,
				scope,
				value: sessionValue,
				...sharedFields
			} satisfies SpeciesCountRecordHighlight;
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
						(row) =>
							row.encounter_count === bestOtherValue && row.visit_date < date
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
					otherRowsInScope.map((row) => row.encounter_count)
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
