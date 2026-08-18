import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import {
	classifyApplyExit,
	parseMissingMigrationVersions,
	findConflictingWorktree,
	registerApplySchemaMigrationTool,
} from '../apply-schema-migration';
import { runNpm } from '../../lib/npm';
import { listWorktrees } from '../../lib/git';

vi.mock('../../lib/npm', () => ({ runNpm: vi.fn() }));
vi.mock('../../lib/git', () => ({ listWorktrees: vi.fn() }));

const runNpmMock = vi.mocked(runNpm);
const listWorktreesMock = vi.mocked(listWorktrees);

const HISTORY_MISMATCH_STDERR =
	'Remote migration versions not found in local migrations directory.\nTry repairing 20240101000000';

describe('classifyApplyExit', () => {
	// Usual
	it('classifies a zero exit as applied', () => {
		expect(classifyApplyExit({ exitCode: 0, stdout: 'local schema applied', stderr: '' })).toBe('applied');
	});

	// Structure
	it('classifies the remote-migration-versions signature as history-mismatch', () => {
		expect(classifyApplyExit({ exitCode: 1, stdout: '', stderr: HISTORY_MISMATCH_STDERR })).toBe(
			'history-mismatch'
		);
	});

	it('matches the signature case-insensitively and in stdout too', () => {
		expect(
			classifyApplyExit({ exitCode: 1, stdout: 'REMOTE MIGRATION VERSIONS NOT FOUND', stderr: '' })
		).toBe('history-mismatch');
	});

	// Edge
	it('classifies an unrelated non-zero exit as error', () => {
		expect(classifyApplyExit({ exitCode: 1, stdout: '', stderr: 'syntax error at or near "SELCT"' })).toBe(
			'error'
		);
	});
});

describe('parseMissingMigrationVersions', () => {
	it('extracts 14-digit migration versions, deduped', () => {
		expect(parseMissingMigrationVersions('missing 20240101000000 and 20240101000000 and 20250202120000')).toEqual([
			'20240101000000',
			'20250202120000',
		]);
	});

	it('returns an empty array when no version is present', () => {
		expect(parseMissingMigrationVersions('nothing here')).toEqual([]);
	});
});

describe('findConflictingWorktree', () => {
	// Structure: a colliding worktree is found
	it('returns the worktree whose migrations dir holds a file for a missing version', () => {
		const result = findConflictingWorktree(
			['20240101000000'],
			[
				{ path: '/wt/self', files: ['20231201000000_self.sql'] },
				{ path: '/wt/other', files: ['20240101000000_other_branch.sql'] },
			]
		);
		expect(result).toBe('/wt/other');
	});

	// Structure: no colliding worktree found
	it('returns undefined when no worktree holds the missing version', () => {
		const result = findConflictingWorktree(
			['20240101000000'],
			[{ path: '/wt/self', files: ['20231201000000_self.sql'] }]
		);
		expect(result).toBeUndefined();
	});
});

describe('apply_schema_migration handler', () => {
	function captureHandler() {
		let handler: (input: { cwd: string }) => Promise<{ structuredContent: unknown }>;
		const server = {
			registerTool: (_name: string, _schema: unknown, cb: typeof handler) => {
				handler = cb;
			},
		};
		registerApplySchemaMigrationTool(server as never);
		return handler!;
	}

	beforeEach(() => {
		runNpmMock.mockReset();
		listWorktreesMock.mockReset();
	});

	// Usual
	it('reports applied and captures stdout on a clean success, without inspecting worktrees', async () => {
		runNpmMock.mockResolvedValue({ stdout: 'local schema applied to local db', stderr: '', exitCode: 0 });
		const { structuredContent } = await captureHandler()({ cwd: '/wt/self' });
		expect(structuredContent).toEqual({
			status: 'applied',
			stdout: 'local schema applied to local db',
			stderr: '',
		});
		expect(listWorktreesMock).not.toHaveBeenCalled();
	});

	// Structure: history-mismatch with a colliding worktree
	it('populates conflictingWorktree when the mismatch collides with another worktree', async () => {
		runNpmMock.mockResolvedValue({ stdout: '', stderr: HISTORY_MISMATCH_STDERR, exitCode: 1 });
		listWorktreesMock.mockResolvedValue([
			{ path: '/wt/self', branch: 'feature/1-self' },
			{ path: '/wt/other', branch: 'feature/2-other' },
		]);
		const readdirSpy = vi.spyOn(fs, 'readdir').mockImplementation(async (dir) => {
			if (String(dir).startsWith('/wt/other')) return ['20240101000000_other_branch.sql'] as never;
			return [] as never;
		});

		const { structuredContent } = await captureHandler()({ cwd: '/wt/self' });
		expect(structuredContent).toMatchObject({ status: 'history-mismatch', conflictingWorktree: '/wt/other' });
		readdirSpy.mockRestore();
	});

	// Structure: history-mismatch but no colliding worktree found
	it('leaves conflictingWorktree undefined when no worktree collides', async () => {
		runNpmMock.mockResolvedValue({ stdout: '', stderr: HISTORY_MISMATCH_STDERR, exitCode: 1 });
		listWorktreesMock.mockResolvedValue([{ path: '/wt/self', branch: 'feature/1-self' }]);
		const readdirSpy = vi.spyOn(fs, 'readdir').mockResolvedValue([] as never);

		const { structuredContent } = await captureHandler()({ cwd: '/wt/self' });
		expect(structuredContent).toEqual({ status: 'history-mismatch', stdout: '', stderr: HISTORY_MISMATCH_STDERR });
		expect(structuredContent).not.toHaveProperty('conflictingWorktree');
		readdirSpy.mockRestore();
	});

	// Edge: unrelated failure — no worktree inspection
	it('reports error and captures stderr on an unrelated failure, without inspecting worktrees', async () => {
		runNpmMock.mockResolvedValue({ stdout: '', stderr: 'syntax error at or near "SELCT"', exitCode: 1 });
		const { structuredContent } = await captureHandler()({ cwd: '/wt/self' });
		expect(structuredContent).toEqual({
			status: 'error',
			stdout: '',
			stderr: 'syntax error at or near "SELCT"',
		});
		expect(listWorktreesMock).not.toHaveBeenCalled();
	});
});
