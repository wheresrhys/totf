import { send } from '@vercel/queue';

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
export type QueueDispatchMode = 'queue' | 'inline';

function resolveDispatchMode(envVarName: string): QueueDispatchMode {
	const configured = process.env[envVarName];
	if (configured === 'queue' || configured === 'inline') {
		return configured;
	}
	return process.env.VERCEL ? 'queue' : 'inline';
}

export function getEventDispatcher<EventType>(
	topic: string,
	dispatchModeEnvVarName: string,
	callback: (event: EventType) => Promise<void>
) {
	const dispatchMode = resolveDispatchMode(dispatchModeEnvVarName);
	return async (event: EventType) => {
		if (dispatchMode === 'queue') {
			await send(topic, event);
			return;
		} else if (dispatchMode === 'inline') {
			await callback(event);
			return;
		}
		throw new Error('invalid dispatch mode');
	};
}
