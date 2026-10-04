import type { ResightingEncounter } from '@/app/models/session';

/**
 * Id (and label) of the resightings page's default tab — the unfiltered view
 * of every resighting, always first in the tab list.
 */
export const ALL_RESIGHTINGS_TAB_ID = 'All';

/**
 * Split a group's resightings into the per-species buckets the resightings
 * page turns into tabs, with the unfiltered `All` bucket always first.
 *
 * Lives here rather than in `PageContent.tsx` (where it used to) because both
 * halves of the page need it and they sit on opposite sides of the
 * server/client boundary: `page.tsx` derives the page's data-driven tab id
 * list from its keys server-side, while the client content component builds
 * the matching `TabConfig[]` and each tab filters itself. A `'use client'`
 * module's exports become client references in a server component, so a
 * server-callable helper can't live in one.
 */
export function groupResightingsBySpecies(
	resightings: ResightingEncounter[]
): Record<string, ResightingEncounter[]> {
	return resightings.reduce<Record<string, ResightingEncounter[]>>(
		(grouped, resighting) => {
			const speciesName = resighting.bird.species.species_name;
			if (!grouped[speciesName]) {
				grouped[speciesName] = [];
			}
			grouped[speciesName].push(resighting);
			return grouped;
		},
		{ [ALL_RESIGHTINGS_TAB_ID]: [...resightings] }
	);
}
