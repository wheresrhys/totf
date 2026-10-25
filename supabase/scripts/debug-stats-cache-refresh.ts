#!/usr/bin/env tsx
/**
 * Debug helper: runs refreshSimpleStatsCache for one group at temporalUnit
 * 'month', scoped to the current calendar month, to reproduce the
 * stats-cache-refresh timeout bug outside the queue consumer.
 *
 * Usage: npm run prod:run -- tsx supabase/scripts/debug-stats-cache-refresh.ts <groupName>
 *
 * Note: `prod:run` signs a read-only (`app_readonly`) JWT, so the write at the
 * end of the refresh will fail with error 25006 — fine if the bug reproduces
 * during the metric-RPC reads themselves (before any write is attempted).
 */
import { supabase } from '../../lib/supabase';
import { getAuthenticatedSupabaseClientForGroup } from '../../app/lib/auth/group-auth';
import { refreshSimpleStatsCache } from '../../lib/stats-cache-refresh';
import { waitForDebugger } from 'inspector';

const [groupName] = process.argv.slice(2);

if (!groupName) {
	console.error('Usage: debug-stats-cache-refresh <groupName>');
	process.exit(1);
}

const { data: group, error: fetchError } = await supabase
	.from('RingingGroups')
	.select('id, group_name')
	.eq('group_name', groupName)
	.single();

if (fetchError || !group) {
	console.error(`Group "${groupName}" not found`);
	process.exit(1);
}

const now = new Date();
const currentMonthPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

console.log(
	`Refreshing stats cache for group "${group.group_name}" (id ${group.id}), temporalUnit month, period ${currentMonthPeriod}`
);

const authedClient = await getAuthenticatedSupabaseClientForGroup(group.id);

console.log('Calling refreshSimpleStatsCache...');
// waitForDebugger();
await refreshSimpleStatsCache(authedClient, {
	groupId: group.id,
	temporalUnit: 'month',
	periods: [currentMonthPeriod]
});
console.log('refreshSimpleStatsCache done.');
