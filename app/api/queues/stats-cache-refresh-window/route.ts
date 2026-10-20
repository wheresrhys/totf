import { handleCallback } from '@vercel/queue';
import type { StatsCacheRefreshEvent } from '@/lib/stats-cache-refresh-events';

/**
 * Noop consumer for the `stats-cache.refresh-window` topic (#1141). Real
 * refresh-by-window logic is a separate future ticket — this logs receipt
 * only, so the event-builder/dispatch-port/consumer shape is established and
 * exercisable (both via the real queue in production and via
 * `lib/queue-dispatch.ts`'s inline mode in local dev, the CLI importer, and
 * tests) ahead of that work.
 *
 * Deliberately a plain exported async function rather than inline logic in
 * `POST` below, per ADR 0001's Question 1: `lib/queue-dispatch.ts`'s inline
 * dispatch mode calls it directly, in-process, with no HTTP round trip and no
 * CloudEvent envelope to construct.
 */
export async function processStatsCacheRefreshWindowJob(
	event: StatsCacheRefreshEvent
): Promise<void> {
	console.log('Received stats-cache-refresh-window event', {
		importJobId: event.importJobId,
		rpcParams: event.rpcParams
	});
}

export const POST = handleCallback(processStatsCacheRefreshWindowJob);
