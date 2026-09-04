// Shared "how did this session rank against every other day" placement
// logic, reused by per-species count/juvenile records (Counts) and weight
// records (Vital stats). 2nd/3rd placements are only reported while the top
// tiers are sparsely held: 2nd place needs fewer than three other days at the
// top value, 3rd place needs fewer than three other days across the top two
// values. A joint 3rd is suppressed — it merely repeats an already-lesser
// record; joint 1st/2nd are still worth reporting.
export type Placement = { placementRank: 1 | 2 | 3; isJointPlacement: boolean };

// Turns a count of strictly-better other days into a placement. Ties share a
// rank (they're the same value). A joint 3rd is suppressed. Returns null
// outside the top 3.
export function resolvePlacement(
	betterDaysCount: number,
	isJointPlacement: boolean
): Placement | null {
	const placementRank = betterDaysCount + 1;
	if (placementRank > 3) return null;
	if (placementRank === 3 && isJointPlacement) return null;
	return { placementRank: placementRank as 1 | 2 | 3, isJointPlacement };
}
