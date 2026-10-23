/**
 * DB integration tests for the `SimpleStatsCacheBySpecies` table's own schema —
 * the per-species half of the period-local stats cache (#1169), and the half
 * `refreshSimpleStatsCache` actually writes. See
 * supabase/schema/schemas/public/tables/"SimpleStatsCacheBySpecies".sql.
 *
 * The assertions live in the shared `testStatsCacheTableShape` runner, which
 * all four stats-cache tables share; everything table-specific is the
 * parameters below.
 */

import {
	DEFAULT_SIMPLE_METRICS,
	NULLABLE_BIOMETRIC_COLUMNS,
	buildSimpleStatsCacheRow
} from './stats-cache-fixtures';
import { testStatsCacheTableShape } from './stats-cache-table-shape';

testStatsCacheTableShape({
	tableName: 'SimpleStatsCacheBySpecies',
	hasSpeciesColumn: true,
	metricColumns: DEFAULT_SIMPLE_METRICS,
	nullableMetricColumns: NULLABLE_BIOMETRIC_COLUMNS,
	updatableColumn: 'bird_count',
	buildRow: buildSimpleStatsCacheRow
});
