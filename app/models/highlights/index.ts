import { runRaritiesGroup } from './rarities';
import { runCountsGroup } from './counts';
import { runVitalStatsGroup } from './vital-stats';
import type { RarityHighlight } from './rarities/types';
import type { CountHighlight } from './counts/types';
import type { VitalStatHighlight } from './vital-stats/types';
import type { LongAbsenceRetrapHighlight } from './long-absence-retrap';

export type { RarityHighlight } from './rarities/types';
export type { CountHighlight } from './counts/types';
export type { VitalStatHighlight } from './vital-stats/types';
export type { LongAbsenceRetrapHighlight } from './long-absence-retrap';
export { deriveLongAbsenceRetraps } from './long-absence-retrap';
export * from './rarities/types';
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
	| RarityHighlight
	| CountHighlight
	| VitalStatHighlight
	| LongAbsenceRetrapHighlight;

// { rarities, counts, vitalStats } — each group's own derive -> rules ->
// compose pipeline. longAbsenceRetraps is exposed alongside them as the
// fourth, sibling group (see long-absence-retrap.ts for why it isn't folded
// into any of the three).
export const rarities = runRaritiesGroup;
export const counts = runCountsGroup;
export const vitalStats = runVitalStatsGroup;
