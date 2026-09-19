import type { TableQueryDefinition } from '../types';

/**
 * A page of Birds with their embedded Encounters/Sessions — powers
 * `fetchPageOfBirds` (`app/actions/sp-data.ts`). When a date range is
 * supplied, the real call site inner-joins the encounter (and its session) so
 * that only birds with at least one in-range encounter are returned, and only
 * their in-range encounters appear in the embedded array — pass
 * `hasDateRange: true` to get that variant's `.select()` string. The
 * snapshot fixture (`tables/Birds/robin-alpha.page-of-birds.json`) always
 * uses the no-date-range variant.
 */
export function buildPageOfBirdsSelect(hasDateRange: boolean): string {
	const encountersRelation = hasDateRange ? 'Encounters!inner' : 'Encounters';
	const sessionRelation = hasDateRange ? 'Sessions!inner' : 'Sessions';
	return `id,
				ring_no,
				last_encountered_timestamp,
				ringing_group_ids,
				proven_age,
				encounters:${encountersRelation} (
					id,
					capture_time,
					min_hatch_year,
					max_hatch_year,
					age_code,
					is_juv,
					record_type,
					sex,
					weight,
					wing_length,
					session:${sessionRelation} (
						id,
						visit_date
					)
				)`;
}

export const pageOfBirdsQuery: TableQueryDefinition = {
	table: 'Birds',
	name: 'page-of-birds',
	select: buildPageOfBirdsSelect(false),
	fixturePaths: ['tables/Birds/robin-alpha.page-of-birds.json']
};
