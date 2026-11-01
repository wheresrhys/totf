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
import { runSimpleStatsCacheRefreshPass } from '@/modules/stats';

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
await runSimpleStatsCacheRefreshPass(
	authedClient,
	{
		groupId: group.id,
		temporalUnit: 'day',
		periods: [
			'2023-08-20',
			'2023-09-02',
			'2021-05-18',
			'2024-03-03',
			'2023-05-24',
			'2024-09-14',
			'2021-10-10',
			'2022-04-30',
			'2025-06-01',
			'2025-06-14',
			'2025-08-17',
			'2024-08-29',
			'2025-05-26',
			'2025-08-23',
			'2026-10-11',
			'2024-06-01',
			'2023-08-30',
			'2023-09-30',
			'2022-05-14',
			'2023-09-16',
			'2024-07-07',
			'2026-08-24',
			'2022-06-18',
			'2024-06-23',
			'2021-07-18',
			'2024-08-17',
			'2025-09-09',
			'2025-08-31',
			'2026-08-07',
			'2022-08-06',
			'2021-09-04',
			'2026-03-22',
			'2025-10-18',
			'2022-05-28',
			'2021-05-26',
			'2024-10-08',
			'2024-11-02',
			'2021-08-05',
			'2024-09-29',
			'2024-04-14',
			'2022-09-24',
			'2023-04-15',
			'2023-04-30',
			'2023-05-06',
			'2024-06-28',
			'2024-07-13',
			'2025-07-26',
			'2022-08-13',
			'2025-08-08',
			'2023-07-18',
			'2024-07-28',
			'2023-07-09',
			'2024-11-10',
			'2025-09-20',
			'2021-06-05',
			'2026-07-25',
			'2025-10-09',
			'2024-06-09',
			'2024-10-05',
			'2024-08-11',
			'2021-07-31',
			'2023-09-09',
			'2024-05-04',
			'2026-05-31',
			'2024-04-18',
			'2026-07-04',
			'2023-06-24',
			'2025-01-17',
			'2025-09-06',
			'2022-06-07',
			'2024-04-16',
			'2026-05-16',
			'2025-08-10',
			'2023-10-08',
			'2024-08-25',
			'2025-09-14',
			'2025-12-16',
			'2025-06-28',
			'2023-05-25',
			'2022-10-15',
			'2025-09-24',
			'2025-03-08',
			'2022-04-09',
			'2022-07-02',
			'2025-08-18',
			'2023-06-03',
			'2022-07-23',
			'2025-08-02',
			'2022-08-27',
			'2025-09-25',
			'2025-10-22',
			'2025-07-12',
			'2026-04-06',
			'2025-11-08',
			'2026-10-17',
			'2025-08-25',
			'2025-10-01',
			'2024-11-30',
			'2023-06-17',
			'2021-08-15'
		]
	},
	false
);
console.log('refreshSimpleStatsCache done.');
