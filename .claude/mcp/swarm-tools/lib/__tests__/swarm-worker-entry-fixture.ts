import type { SwarmWorkerEntry } from '../state-file';

/** Builds a minimal valid `SwarmWorkerEntry`, overriding only the fields a test cares about. */
export function makeSwarmWorkerEntry(overrides: Partial<SwarmWorkerEntry> = {}): SwarmWorkerEntry {
	return {
		kind: 'ticket',
		issue: 1,
		pr: null,
		branch: 'feature/1-example',
		title: 'Example',
		worktreePath: '/tmp/example',
		agentId: 'agent-1',
		model: 'sonnet',
		startedAt: '2026-01-01T00:00:00.000Z',
		...overrides,
	};
}
