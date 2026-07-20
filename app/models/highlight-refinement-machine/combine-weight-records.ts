import {
	combinedSortValue,
	type CombinedWeightRecordHighlight,
	type SessionHighlight,
	type WeightRecordHighlight
} from '@/app/models/session-highlights';

function isWeightRecord(
	highlight: SessionHighlight
): highlight is WeightRecordHighlight {
	return highlight.type === 'weight-record';
}

// Comb-7: reconcile a species' this-year and all-time weight records for the
// same extreme. Derivation emits a this-year weight only for an outright leader
// (a 1st place), so every this-year weight is a "heaviest/lightest of the year".
// When the same species+extreme also holds an all-time placement:
//   - all-time 1st: being the heaviest ever subsumes the year claim, so keep the
//     plain all-time line and drop the this-year one.
//   - all-time 2nd/3rd: merge into one line — the year claim is the headline, the
//     all-time placement rides along in parentheses ("... (2nd heaviest ever)").
// A this-year weight with no matching all-time placement is left untouched (it
// stays a plain "heaviest of the year" line). Weight records are deliberately not
// deduped by Rem-2; all scope reconciliation for weights happens here.
export function combineWeightRecords(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	const thisYearWeights = highlights.filter(
		(highlight) => isWeightRecord(highlight) && highlight.scope === 'this-year'
	) as WeightRecordHighlight[];
	if (thisYearWeights.length === 0) return highlights;

	const removed = new Set<SessionHighlight>();
	const combinedByThisYear = new Map<
		WeightRecordHighlight,
		CombinedWeightRecordHighlight
	>();
	for (const thisYear of thisYearWeights) {
		const allTime = highlights.find(
			(highlight) =>
				isWeightRecord(highlight) &&
				highlight.scope === 'all-time' &&
				highlight.speciesName === thisYear.speciesName &&
				highlight.extreme === thisYear.extreme
		) as WeightRecordHighlight | undefined;
		if (!allTime) continue; // no all-time placement — leave the year line as-is
		if (allTime.placementRank === 1) {
			// The all-time 1st already says everything the year line would; drop it
			removed.add(thisYear);
			continue;
		}
		// all-time 2nd/3rd — fold both into one combined line
		removed.add(thisYear);
		removed.add(allTime);
		combinedByThisYear.set(thisYear, {
			type: 'combined-weight-record',
			sortValue: combinedSortValue([thisYear, allTime]),
			speciesName: thisYear.speciesName,
			extreme: thisYear.extreme,
			weight: thisYear.weight,
			year: thisYear.year,
			isCurrentYear: thisYear.isCurrentYear,
			thisYearIsJoint: thisYear.isJointPlacement,
			allTimeRank: allTime.placementRank,
			allTimeIsJoint: allTime.isJointPlacement
		});
	}
	if (removed.size === 0) return highlights;

	// Each combined line takes the position of the this-year highlight it replaces;
	// the removed all-time part just drops out.
	const result: SessionHighlight[] = [];
	for (const highlight of highlights) {
		const combined = isWeightRecord(highlight)
			? combinedByThisYear.get(highlight)
			: undefined;
		if (combined) {
			result.push(combined);
			continue;
		}
		if (removed.has(highlight)) continue;
		result.push(highlight);
	}
	return result;
}
