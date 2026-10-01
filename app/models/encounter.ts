import type { EncounterRow } from './db';

export type AgeClass = 'pullus' | 'juv' | 'postjuv' | 'adult' | 'unknown';

export function getAgeClass(
	encounter: Pick<EncounterRow, 'age_code' | 'is_juv'>
): AgeClass {
	if (encounter.is_juv) return 'juv';
	if (encounter.age_code === 1) return 'pullus';
	if (encounter.age_code === 3) return 'postjuv';
	if (encounter.age_code !== null && encounter.age_code > 3) return 'adult';
	return 'unknown';
}

/**
 * Whether an encounter counts as mist-netted for the session page's
 * "Mist-netting" tab / net-round grouping (#1022). A blank/null
 * `capture_method` is treated as mist-net, not as "some other method": the
 * field has only recently started being read anywhere in the app, so almost
 * all existing data (every local/e2e seed fixture included) has it unset —
 * treating unset as "other" would misclassify that entire historical dataset
 * and silently empty out net rounds everywhere. Only an explicit, non-'M'
 * code (hand-caught, box trap, etc) counts as a genuine "other catch".
 */
export function isMistNetEncounter(
	encounter: Pick<EncounterRow, 'capture_method'>
): boolean {
	return !encounter.capture_method || encounter.capture_method === 'M';
}
