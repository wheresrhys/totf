/**
 * DB integration tests for the `ComplexStatsCache` table's own schema — the
 * all-species-combined half of the lifetime-relative stats cache (#1169). See
 * supabase/schema/schemas/public/tables/"ComplexStatsCache".sql.
 *
 * The assertions live in the shared `testStatsCacheTableShape` runner, which
 * all four stats-cache tables share; everything table-specific is the
 * parameters below. Note the absent `speciesId`: this table has no species_id
 * column at all, which is what the runner's "has no species_id column to write
 * to at all" case pins.
 */

import {
	DEFAULT_COMPLEX_METRICS,
	buildComplexStatsCacheRow
} from './stats-cache-fixtures';
import { testStatsCacheTableShape } from './stats-cache-table-shape';

testStatsCacheTableShape({
	tableName: 'ComplexStatsCache',
	hasSpeciesColumn: false,
	metricColumns: DEFAULT_COMPLEX_METRICS,
	updatableColumn: 'new_adult_bird_count',
	buildRow: ({ groupId, temporalUnit, timePeriod }) =>
		buildComplexStatsCacheRow({ groupId, temporalUnit, timePeriod })
});
