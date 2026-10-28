import { send } from '@vercel/queue';
// Relative, not `@/`-aliased: `lib/` is cross-zone shared code (used by both
// the Next.js app and `supabase/scripts/`, per root CLAUDE.md's "Project
// structure"), and `@/` alias resolution is scoped to tsconfig.json's
// `include` (`app/**`, `types/**`), which `lib/` itself sits outside of — a
// `lib/` module reaching into `app/` via `@/` fails to resolve at runtime
// (Vitest, and the CLI importer's `tsx`/Node runner alike), the same reason
// `supabase/scripts/import-csv.ts` imports `app/lib/auth/group-auth`
// relatively rather than aliased.
import { processStatsCacheRefreshWindowJob } from '../../app/api/queues/stats-cache-refresh-window/route';
import type { StatsCacheRefreshEvent } from './stats-cache-refresh-events';

/**
 * One-function dispatch port in front of Vercel Queues' `send()`, per ADR
 * 0001's Question 1 recommendation — Vercel Queues has no offline emulator,
 * so anything that only works through the real queue can't be exercised
 * locally, in the CLI importer, or in tests. `queue` mode is the real thing;
 * `inline` mode calls the consumer's exported handler directly, in-process.
 *
 * `inline` is not test-only scaffolding: `supabase/scripts/import-csv.ts`
 * runs on a human's laptop with no Vercel deployment to publish to, so it
 * genuinely needs the inline path in production use, the same way the CLI
 * importer stays fully synchronous rather than publishing to a topic.
 */
export type StatsCacheRefreshDispatchMode = 'queue' | 'inline';

const STATS_CACHE_REFRESH_WINDOW_TOPIC = 'stats-cache-refresh-window';

/**
 * Chosen by `STATS_CACHE_REFRESH_DISPATCH_MODE`, defaulting to `queue` when
 * `process.env.VERCEL` is set (a real Vercel deployment), else `inline`
 * (local dev, the CLI importer).
 */
function resolveDispatchMode(): StatsCacheRefreshDispatchMode {
	const configured = process.env.STATS_CACHE_REFRESH_DISPATCH_MODE;
	if (configured === 'queue' || configured === 'inline') {
		return configured;
	}
	return process.env.VERCEL ? 'queue' : 'inline';
}

/**
 * Dispatches one stats-cache-refresh-window event, via the real queue or
 * in-process depending on {@link resolveDispatchMode}.
 */
export async function dispatchStatsCacheRefreshWindow(
	event: StatsCacheRefreshEvent
): Promise<void> {
	if (resolveDispatchMode() === 'queue') {
		await send(STATS_CACHE_REFRESH_WINDOW_TOPIC, event);
		return;
	}
	await processStatsCacheRefreshWindowJob(event);
}
