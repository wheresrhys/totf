import { intervalToDuration } from 'date-fns';
import type { LongAbsenceRetrapsResult } from '@/app/models/db';

// long-absence-retrap is a sibling of the three group directories
// (rarities/counts/vital-stats), not inside any of them. Unlike everything
// else in this tree, it's sourced from a per-bird RPC (long_absence_retraps),
// not the aggregate stats_per_day_and_species matrix the three groups are
// built from — it's recoveries-shaped, not rarity-shaped. See #408's comment
// for the full rationale: it's the natural seed for a future "Notable
// retraps" section once that's designed, out of scope here.
export type LongAbsenceRetrapHighlight = {
	type: 'long-absence-retrap';
	ringNo: string;
	speciesName: string;
	// ISO date string of the previous encounter (e.g. "2021-06-20")
	previousDate: string;
	// Gap in whole years and months (zero months omitted from copy)
	gapYears: number;
	gapMonths: number;
};

// Maps RPC rows to LongAbsenceRetrapHighlights, preserving the gap-descending
// order returned by the RPC. The session date is needed to compute the
// years+months gap relative to the day the bird was last seen.
export function deriveLongAbsenceRetraps(
	results: LongAbsenceRetrapsResult[],
	sessionDate: string
): LongAbsenceRetrapHighlight[] {
	const sessionDateObj = new Date(sessionDate);
	return results.map((result) => {
		const previousDateObj = new Date(result.previous_date);
		const duration = intervalToDuration({
			start: previousDateObj,
			end: sessionDateObj
		});
		// intervalToDuration gives years+months+days+etc; we only want years and months
		const gapYears = duration.years ?? 0;
		const gapMonths = duration.months ?? 0;
		return {
			type: 'long-absence-retrap',
			ringNo: result.ring_no,
			speciesName: result.species_name,
			previousDate: result.previous_date,
			gapYears,
			gapMonths
		};
	});
}
