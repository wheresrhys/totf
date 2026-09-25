import { runVitalStatsGroup } from './vital-stats';
import type { CountHighlight } from './counts/types';
import type { VitalStatHighlight } from './vital-stats/types';
import type { LongAbsenceRetrapHighlight } from './long-absence-retrap';

export type { CountHighlight } from './counts/types';
export type { VitalStatHighlight } from './vital-stats/types';
export type { LongAbsenceRetrapHighlight } from './long-absence-retrap';
export { deriveLongAbsenceRetraps } from './long-absence-retrap';
export * from './counts/types';
export * from './vital-stats/types';
export type { SessionStatsData } from './shared/session-stats';
export type { RecordScope } from './shared/record-scope';

// Documented but currently unwired — see
// shared/rare-species-suppression.ts for the extension point #418 designs
// and wires: threading a suppression signal from Rarities into Counts and
// Vital-stats before their own combine steps run.
export type { RareSpeciesSuppressionSignal } from './shared/rare-species-suppression';

// The discriminated union spanning every group plus the long-absence-retrap
// sibling.
export type SessionHighlight =
	| CountHighlight
	| VitalStatHighlight
	| LongAbsenceRetrapHighlight;

// { vitalStats } — the group's own derive -> rules -> compose pipeline.
// longAbsenceRetraps is exposed alongside it as a sibling group (see
// long-absence-retrap.ts for why it isn't folded into any group).
//
// Rarities and Counts used to live here too. Both are now produced by the v2
// highlight pipeline instead (app/lib/highlights/v2): Counts in #989, Rarities
// in #990 (rules/first-species-record.ts, only-species-record.ts and
// rare-species.ts). The session page reads both pipelines and renders each
// section from whichever one owns it — see
// app/components/pages/session/SessionHighlights.tsx.
export const vitalStats = runVitalStatsGroup;
