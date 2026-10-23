/**
 * DB integration tests for the `SimpleStatsCache` table's own schema — the
 * all-species-combined half of the period-local stats cache (#1169). See
 * supabase/schema/schemas/public/tables/"SimpleStatsCache".sql.
 *
 * The assertions live in the shared `testStatsCacheTableShape` runner, which
 * all four stats-cache tables share; everything table-specific is the
 * parameters below. Note the absent `speciesId`: this table has no species_id
 * column at all, which is what the runner's "has no species_id column to write
 * to at all" case pins.
 */

import {
	DEFAULT_SIMPLE_METRICS,
	NULLABLE_BIOMETRIC_COLUMNS,
	buildSimpleStatsCacheRow
} from './stats-cache-fixtures';
import { testStatsCacheTableShape } from './stats-cache-table-shape';

testStatsCacheTableShape({
	tableName: 'SimpleStatsCache',
	hasSpeciesColumn: false,
	metricColumns: DEFAULT_SIMPLE_METRICS,
	nullableMetricColumns: NULLABLE_BIOMETRIC_COLUMNS,
	updatableColumn: 'bird_count',
	buildRow: ({ groupId, temporalUnit, timePeriod }) =>
		buildSimpleStatsCacheRow({ groupId, temporalUnit, timePeriod })
});
