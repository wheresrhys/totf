// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execa } from 'execa';
import { ensureWorktreeEnv } from '../ensure-worktree-env';
import { gitEnv as baseGitEnv } from '../../lib/__tests__/git-test-env';

function gitEnv(): NodeJS.ProcessEnv {
	// CI runners have no global user.name/user.email configured, so `git commit`
	// fails with exit 128 ("Please tell me who you are") unless an identity is
	// supplied explicitly — don't rely on the ambient environment's git config.
	return {
		...baseGitEnv(),
		GIT_AUTHOR_NAME: 'ensure-worktree-env test',
		GIT_AUTHOR_EMAIL: 'ensure-worktree-env-test@example.com',
		GIT_COMMITTER_NAME: 'ensure-worktree-env test',
		GIT_COMMITTER_EMAIL: 'ensure-worktree-env-test@example.com',
	};
}

describe('ensure_worktree_env', () => {
	// A real main checkout plus a real linked `git worktree add` worktree — resolveMainCheckoutRoot
	// (git-common-dir) only resolves to a *different* directory than the worktree itself when the
	// worktree is genuinely linked, so a bare `git init` (as the migrations-tool test uses) can't
	// exercise `copied`/`already-present`/`source-missing` distinctly from `same-as-source`.
	let mainRoot: string;
	let worktreePath: string;

	beforeEach(async () => {
		const base = await fs.mkdtemp(
			path.join(os.tmpdir(), 'ensure-worktree-env-')
		);
		mainRoot = path.join(base, 'main');
		worktreePath = path.join(base, 'wt');
		await fs.mkdir(mainRoot, { recursive: true });
		await execa('git', ['init', '--quiet'], {
			cwd: mainRoot,
			env: gitEnv(),
			extendEnv: false
		});
		await execa('git', ['commit', '--quiet', '--allow-empty', '-m', 'init'], {
			cwd: mainRoot,
			env: gitEnv(),
			extendEnv: false
		});
		await execa(
			'git',
			['worktree', 'add', '--quiet', worktreePath, '-b', 'wt-branch'],
			{
				cwd: mainRoot,
				env: gitEnv(),
				extendEnv: false
			}
		);
	});

	afterEach(async () => {
		await fs.rm(path.dirname(mainRoot), { recursive: true, force: true });
	});

	// Usual
	it('copies .env.dev from the main checkout root into a fresh worktree that has none', async () => {
		await fs.writeFile(
			path.join(mainRoot, '.env.dev'),
			'SUPABASE_JWT_ROLE=authenticated\n',
			'utf8'
		);

		const result = await ensureWorktreeEnv(worktreePath);

		expect(result.status).toBe('copied');
		// sourcePath comes back through git-resolved (realpath'd) mainRoot, so compare via realpath
		// rather than the possibly-symlinked path this test passed as cwd (e.g. macOS /tmp vs
		// /private/tmp).
		expect(result.sourcePath).toBe(
			path.join(await fs.realpath(mainRoot), '.env.dev')
		);
		expect(result.destPath).toBe(path.join(worktreePath, '.env.dev'));
		await expect(fs.readFile(result.destPath, 'utf8')).resolves.toBe(
			'SUPABASE_JWT_ROLE=authenticated\n'
		);
	});

	// Structure
	it('leaves an existing worktree .env.dev untouched (no-clobber) rather than overwriting it', async () => {
		await fs.writeFile(
			path.join(mainRoot, '.env.dev'),
			'SUPABASE_JWT_ROLE=authenticated\n',
			'utf8'
		);
		await fs.writeFile(
			path.join(worktreePath, '.env.dev'),
			'SUPABASE_JWT_ROLE=app_readonly\n',
			'utf8'
		);

		const result = await ensureWorktreeEnv(worktreePath);

		expect(result.status).toBe('already-present');
		await expect(
			fs.readFile(path.join(worktreePath, '.env.dev'), 'utf8')
		).resolves.toBe('SUPABASE_JWT_ROLE=app_readonly\n');
	});

	it('is a safe no-op when called against the main checkout itself (source and dest coincide)', async () => {
		await fs.writeFile(
			path.join(mainRoot, '.env.dev'),
			'SUPABASE_JWT_ROLE=authenticated\n',
			'utf8'
		);

		const result = await ensureWorktreeEnv(mainRoot);

		expect(result.status).toBe('same-as-source');
		// sourcePath comes back git-resolved (realpath'd); destPath is built straight from the
		// caller-supplied mainRoot, which this test deliberately passes un-resolved (macOS /tmp vs
		// /private/tmp) — compare the real paths, not the literal strings.
		expect(await fs.realpath(result.sourcePath)).toBe(
			await fs.realpath(result.destPath)
		);
		await expect(
			fs.readFile(path.join(mainRoot, '.env.dev'), 'utf8')
		).resolves.toBe('SUPABASE_JWT_ROLE=authenticated\n');
	});

	// Edge
	it("returns 'source-missing' rather than throwing when the main checkout itself has no .env.dev", async () => {
		const result = await ensureWorktreeEnv(worktreePath);

		expect(result.status).toBe('source-missing');
		await expect(
			fs.access(path.join(worktreePath, '.env.dev'))
		).rejects.toThrow();
	});
});
