// Barrel for the per-group session-highlight render library (#760) — each
// group's renderer file stays pure data -> sentence for that group's own
// union (see docs/session-highlight-ordering.md). Re-exporting both the
// dispatch function and its underlying renderer map lets a caller either
// render a single highlight or derive group membership from the map's keys
// (e.g. app/components/pages/session/SessionHighlights.tsx partitioning a
// flat SessionHighlight[] into its three sections).
//
// long-absence-retrap-renderer.tsx is a deliberate omission — it's a sibling
// of the three groups, not one of them, and isn't wired into any page yet.
export {
	renderRarityHighlight,
	HIGHLIGHT_RENDERERS as RARITY_HIGHLIGHT_RENDERERS
} from './rarities/renderers';
export {
	renderCountHighlight,
	HIGHLIGHT_RENDERERS as COUNT_HIGHLIGHT_RENDERERS
} from './counts/renderers';
export {
	renderVitalStatHighlight,
	HIGHLIGHT_RENDERERS as VITAL_STAT_HIGHLIGHT_RENDERERS
} from './vital-stats/renderers';
