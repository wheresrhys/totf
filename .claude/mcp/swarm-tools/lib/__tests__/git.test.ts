import { describe, it, expect } from 'vitest';
import { parseBranchList, parseWorktreeList, parseBranchTip, parseAheadBehind } from '../git';

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

	// Structure
	it('strips the "+" worktree-checkout marker from a branch checked out in another worktree', () => {
		const stdout = ['  main', '+ feature/859-x'].join('\n');
		expect(parseBranchList(stdout)).toEqual(['main', 'feature/859-x']);
	});

	// Edge
	it('dedupes a "+"-marked branch against its remotes/origin/ counterpart', () => {
		const stdout = ['+ feature/859-x', '  remotes/origin/feature/859-x'].join('\n');
		expect(parseBranchList(stdout)).toEqual(['feature/859-x']);
	});

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

describe('parseBranchTip', () => {
	// Usual
	it('splits the committer date from the subject', () => {
		expect(parseBranchTip('2026-01-05T09:30:00+00:00\x1fAdd the thing')).toEqual({
			committedDate: '2026-01-05T09:30:00+00:00',
			subject: 'Add the thing',
		});
	});

	// Structure — only the first separator splits, so a subject containing one survives intact.
	it('keeps a separator inside the subject', () => {
		expect(parseBranchTip('2026-01-05T09:30:00+00:00\x1fa\x1fb')?.subject).toBe('a\x1fb');
	});

	it('trims the trailing newline git appends', () => {
		expect(parseBranchTip('2026-01-05T09:30:00+00:00\x1fAdd the thing\n')?.subject).toBe('Add the thing');
	});

	// Edge
	it('returns an empty subject when the commit has no subject line', () => {
		expect(parseBranchTip('2026-01-05T09:30:00+00:00\x1f')).toEqual({
			committedDate: '2026-01-05T09:30:00+00:00',
			subject: '',
		});
	});

	it('returns null for empty output', () => {
		expect(parseBranchTip('')).toBeNull();
	});
});

describe('parseAheadBehind', () => {
	// Usual — `git rev-list --left-right --count base...branch` prints "<behind>\t<ahead>".
	it('reads the left count as behind and the right count as ahead', () => {
		expect(parseAheadBehind('17\t2\n')).toEqual({ behind: 17, ahead: 2 });
	});

	// Structure
	it('handles a branch level with its base', () => {
		expect(parseAheadBehind('0\t0')).toEqual({ behind: 0, ahead: 0 });
	});

	// Edge
	it('returns null for empty output', () => {
		expect(parseAheadBehind('')).toBeNull();
	});

	it('returns null when the output is not two counts', () => {
		expect(parseAheadBehind('17')).toBeNull();
	});

	it('returns null for non-numeric output', () => {
		expect(parseAheadBehind('fatal: bad revision\tx')).toBeNull();
	});
});
