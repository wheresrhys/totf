/**
 * DB integration tests for the `ComplexStatsCacheBySpecies` table's own schema
 * — the per-species half of the lifetime-relative stats cache (#1169), and the
 * half `refreshComplexStatsCache` actually writes. See
 * supabase/schema/schemas/public/tables/"ComplexStatsCacheBySpecies".sql.
 *
 * The assertions live in the shared `testStatsCacheTableShape` runner, which
 * all four stats-cache tables share; everything table-specific is the
 * parameters below.
 */

import {
	DEFAULT_COMPLEX_METRICS,
	buildComplexStatsCacheRow
} from './stats-cache-fixtures';
import { testStatsCacheTableShape } from './stats-cache-table-shape';

testStatsCacheTableShape({
	tableName: 'ComplexStatsCacheBySpecies',
	hasSpeciesColumn: true,
	metricColumns: DEFAULT_COMPLEX_METRICS,
	updatableColumn: 'new_adult_bird_count',
	buildRow: buildComplexStatsCacheRow
});
