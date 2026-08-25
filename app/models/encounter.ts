import type { EncounterRow } from './db';

export type AgeClass = 'pullus' | 'juv' | 'postjuv' | 'adult' | 'unknown';

export function getAgeClass(
	encounter: Pick<EncounterRow, 'age_code' | 'is_juv'>
): AgeClass {
	if (encounter.age_code === 1 && !encounter.is_juv) return 'pullus';
	if (encounter.age_code === 1 && encounter.is_juv) return 'juv';
	if (encounter.age_code === 3 && encounter.is_juv) return 'juv';
	if (encounter.age_code === 3 && !encounter.is_juv) return 'postjuv';
	if (encounter.age_code !== null && encounter.age_code > 3) return 'adult';
	return 'unknown';
}
