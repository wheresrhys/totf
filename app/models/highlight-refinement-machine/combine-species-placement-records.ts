import {
	combinedSortValue,
	type CombinedSpeciesPlacementRecordHighlight,
	type SessionHighlight,
	type SpeciesCountRecordHighlight
} from '@/app/models/session-highlights';

// An all-time species-count record that placed 2nd or 3rd — the "Second/Third
// best day for X ever" lines. Strict records, "record-equalling" all-time ties
// (placementRank 1) and this-year records are excluded: only genuine 2nd/3rd
// placements merge here.
type PlacementRecord = SpeciesCountRecordHighlight & { placementRank: 2 | 3 };

function isPlacementRecord(
	highlight: SessionHighlight
): highlight is PlacementRecord {
	return (
		highlight.type === 'species-count-record' &&
		(highlight.placementRank === 2 || highlight.placementRank === 3)
	);
}

// Merges one rank's placements into a single line. The count survives only when
// every part shares it and the group isn't all-joint: an all-joint group drops
// the count (each part could sit against a different tied value), a mixed or
// all-strict group keeps a count the whole list agrees on.
function combinePlacementGroup(
	group: PlacementRecord[]
): CombinedSpeciesPlacementRecordHighlight {
	const allJoint = group.every((record) => record.isJointPlacement === true);
	const [firstValue] = group.map((record) => record.value);
	const sharedValue = group.every((record) => record.value === firstValue)
		? firstValue
		: undefined;
	return {
		type: 'combined-species-placement-record',
		sortValue: combinedSortValue(group),
		placementRank: group[0].placementRank,
		species: group.map((record) => ({
			name: record.speciesName,
			isJoint: record.isJointPlacement === true
		})),
		...(!allJoint && sharedValue !== undefined ? { value: sharedValue } : {})
	};
}

// Comb: multiple all-time "Second/Third best day for <species> ever" records
// merge into one line per rank — "Second best day for A and B ever — N birds".
// 2nd-best and 3rd-best records merge separately (a rank never mixes with the
// other), and a rank with only one placement is left unchanged. Each combined
// line takes the position of the first record of its rank.
export function combineSpeciesPlacementRecords(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	const groupByRank = new Map<2 | 3, PlacementRecord[]>();
	for (const highlight of highlights) {
		if (!isPlacementRecord(highlight)) continue;
		const group = groupByRank.get(highlight.placementRank) ?? [];
		group.push(highlight);
		groupByRank.set(highlight.placementRank, group);
	}
	// Only ranks holding at least two placements merge
	const mergingRanks = new Set(
		[...groupByRank]
			.filter(([, group]) => group.length >= 2)
			.map(([rank]) => rank)
	);
	if (mergingRanks.size === 0) return highlights;

	const insertedRanks = new Set<2 | 3>();
	const result: SessionHighlight[] = [];
	for (const highlight of highlights) {
		if (
			isPlacementRecord(highlight) &&
			mergingRanks.has(highlight.placementRank)
		) {
			// Emit the combined line in place of the rank's first record; drop the rest
			if (insertedRanks.has(highlight.placementRank)) continue;
			insertedRanks.add(highlight.placementRank);
			result.push(
				combinePlacementGroup(groupByRank.get(highlight.placementRank)!)
			);
			continue;
		}
		result.push(highlight);
	}
	return result;
}
