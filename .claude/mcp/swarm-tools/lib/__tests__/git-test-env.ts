import { execa } from 'execa';

// git honours an inherited GIT_DIR over cwd (git sets it when invoking hooks), so strip the
// discovery overrides before any git call a test makes against an isolated temp repo/worktree —
// otherwise a suite run from the pre-push hook would re-target the real repo's .git instead of
// the isolated temp one the test just created.
export function gitEnv(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	delete env.GIT_DIR;
	delete env.GIT_WORK_TREE;
	delete env.GIT_INDEX_FILE;
	return env;
}

/** Initializes a quiet git repo at `dir`, using the stripped env from `gitEnv()` unless overridden. */
export async function initGitRepo(dir: string, env: NodeJS.ProcessEnv = gitEnv()): Promise<void> {
	await execa('git', ['init', '--quiet'], { cwd: dir, env, extendEnv: false });
}
