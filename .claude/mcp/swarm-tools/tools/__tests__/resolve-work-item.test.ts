import { describe, it, expect } from 'vitest';
import { parseNumericIdentifier, looksLikeParaphrase, matchStateFileStrategies } from '../resolve-work-item';
import type { SwarmWorkerEntry } from '../../lib/state-file';

function makeEntry(overrides: Partial<SwarmWorkerEntry>): SwarmWorkerEntry {
	return {
		kind: 'ticket',
		issue: null,
		pr: null,
		branch: 'feature/1-example',
		title: 'Example ticket',
		worktreePath: '/tmp/example',
		agentId: 'agent-1',
		model: 'sonnet',
		startedAt: '2026-01-01T00:00:00.000Z',
		...overrides,
	};
}

describe('parseNumericIdentifier', () => {
	// Usual
	it('parses a plain number', () => {
		expect(parseNumericIdentifier('412')).toBe(412);
	});

	// Structure
	it('parses a #-prefixed number', () => {
		expect(parseNumericIdentifier('#412')).toBe(412);
	});

	// Edge
	it('returns null for a non-numeric string', () => {
		expect(parseNumericIdentifier('feature/412-x')).toBeNull();
	});

	it('returns null for an empty string', () => {
		expect(parseNumericIdentifier('')).toBeNull();
	});
});

describe('looksLikeParaphrase', () => {
	// Usual
	it('treats free text with spaces as a paraphrase', () => {
		expect(looksLikeParaphrase('the species chart ticket')).toBe(true);
	});

	// Structure
	it('does not treat a branch-shaped string as a paraphrase', () => {
		expect(looksLikeParaphrase('feature/412-species-chart')).toBe(false);
	});

	it('does not treat a plain number as a paraphrase', () => {
		expect(looksLikeParaphrase('412')).toBe(false);
	});

	// Edge
	it('does not treat an empty string as a paraphrase', () => {
		expect(looksLikeParaphrase('')).toBe(false);
	});
});

describe('matchStateFileStrategies', () => {
	// Usual
	it('matches on exact branch name first', () => {
		const entries = [makeEntry({ branch: 'feature/412-species-chart', agentId: 'a' })];
		const result = matchStateFileStrategies(entries, 'feature/412-species-chart');
		expect(result).toEqual({ strategy: 'exact-branch', entries: [entries[0]] });
	});

	// Structure (one per strategy)
	it('falls back to issue/PR number match', () => {
		const entries = [makeEntry({ branch: 'feature/412-x', issue: 412, agentId: 'a' })];
		const result = matchStateFileStrategies(entries, '412');
		expect(result?.strategy).toBe('issue-or-pr-number');
		expect(result?.entries).toEqual([entries[0]]);
	});

	it('falls back to agent id match', () => {
		const entries = [makeEntry({ branch: 'feature/412-x', agentId: 'agent-xyz' })];
		const result = matchStateFileStrategies(entries, 'agent-xyz');
		expect(result?.strategy).toBe('agent-id');
	});

	it('falls back to case-insensitive title substring match', () => {
		const entries = [makeEntry({ branch: 'feature/412-x', title: 'Add Species Chart', agentId: 'a' })];
		const result = matchStateFileStrategies(entries, 'species chart');
		expect(result?.strategy).toBe('title-substring');
	});

	// Edge
	it('returns null when no strategy matches', () => {
		const entries = [makeEntry({ branch: 'feature/412-x', agentId: 'a', title: 'Unrelated' })];
		expect(matchStateFileStrategies(entries, 'nothing-like-this')).toBeNull();
	});

	it('returns multiple entries when a strategy is ambiguous rather than falling through', () => {
		const entries = [
			makeEntry({ branch: 'feature/1-x', issue: 412, agentId: 'a', title: 'First' }),
			makeEntry({ branch: 'feature/2-x', issue: 412, agentId: 'b', title: 'Second' }),
		];
		const result = matchStateFileStrategies(entries, '412');
		expect(result?.strategy).toBe('issue-or-pr-number');
		expect(result?.entries).toHaveLength(2);
	});

	it('returns an empty array from listState treated as no matches', () => {
		expect(matchStateFileStrategies([], 'anything')).toBeNull();
	});
});
