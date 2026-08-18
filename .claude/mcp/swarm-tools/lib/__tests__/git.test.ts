import { describe, it, expect } from 'vitest';
import { parseBranchList, parseWorktreeList } from '../git';

describe('parseBranchList', () => {
	// Usual
	it('parses local and remote branches, stripping the remotes/origin/ prefix', () => {
		const stdout = ['* main', '  feature/1-x', '  remotes/origin/main', '  remotes/origin/feature/1-x'].join('\n');
		expect(parseBranchList(stdout)).toEqual(['main', 'feature/1-x']);
	});

	// Structure
	it('dedupes a branch present both locally and on origin', () => {
		const stdout = ['  feature/1-x', '  remotes/origin/feature/1-x'].join('\n');
		expect(parseBranchList(stdout)).toEqual(['feature/1-x']);
	});

	it('excludes remotes/origin/HEAD', () => {
		const stdout = ['  main', '  remotes/origin/HEAD -> origin/main'].join('\n');
		expect(parseBranchList(stdout)).toEqual(['main']);
	});

	// Edge
	it('returns an empty array for empty output', () => {
		expect(parseBranchList('')).toEqual([]);
	});
});

describe('parseWorktreeList', () => {
	// Usual
	it('parses multiple worktree entries with their branches', () => {
		const stdout = [
			'worktree /repo',
			'HEAD abc123',
			'branch refs/heads/main',
			'',
			'worktree /repo/.claude/worktrees/agent-1',
			'HEAD def456',
			'branch refs/heads/feature/1-x',
			'',
		].join('\n');
		expect(parseWorktreeList(stdout)).toEqual([
			{ path: '/repo', branch: 'main' },
			{ path: '/repo/.claude/worktrees/agent-1', branch: 'feature/1-x' },
		]);
	});

	// Edge
	it('handles a detached worktree with no branch line', () => {
		const stdout = ['worktree /repo/detached', 'HEAD abc123', 'detached', ''].join('\n');
		expect(parseWorktreeList(stdout)).toEqual([{ path: '/repo/detached', branch: null }]);
	});

	it('returns an empty array for empty output', () => {
		expect(parseWorktreeList('')).toEqual([]);
	});
});
