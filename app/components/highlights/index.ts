// Barrel for the per-group session-highlight render library (#760) — each
// group's renderer file stays pure data -> sentence for that group's own
// union (see docs/session-highlight-ordering.md). Re-exporting both the
// dispatch function and its underlying renderer map lets a caller either
// render a single highlight or derive group membership from the map's keys
// (e.g. app/components/pages/session/SessionHighlights.tsx partitioning a
// flat SessionHighlight[] into its sections).
//
// Only Vital stats is left here: the Counts (#989) and Rarities (#990) sections
// are now rendered by their v2 rules' own printers
// (app/lib/highlights/v2/rules/*), which travel on the highlight itself, so
// neither needs a renderer map on this side.
//
// long-absence-retrap-renderer.tsx is a deliberate omission — it's a sibling
// of the groups, not one of them, and isn't wired into any page yet.
export {
	renderVitalStatHighlight,
	HIGHLIGHT_RENDERERS as VITAL_STAT_HIGHLIGHT_RENDERERS
} from './vital-stats/renderers';
