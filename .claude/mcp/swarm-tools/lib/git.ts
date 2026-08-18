import { execa } from 'execa';

export interface GitResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export async function runGit(args: string[], cwd?: string): Promise<GitResult> {
	const result = await execa('git', args, { cwd, reject: false });
	return {
		stdout: result.stdout,
		stderr: result.stderr,
		exitCode: result.exitCode ?? 1,
	};
}

/** Parses `git branch -a` output into branch names, with `remotes/origin/` stripped and deduped. */
export function parseBranchList(stdout: string): string[] {
	const names = stdout
		.split('\n')
		.map((line) => line.replace(/^\*?\s+/, '').trim())
		.filter(Boolean)
		.filter((line) => !line.startsWith('remotes/origin/HEAD'))
		.map((line) => line.replace(/^remotes\/origin\//, ''));
	return Array.from(new Set(names));
}

/** Local + remote branch names from `git branch -a`, with `remotes/origin/` stripped and deduped. */
export async function listBranches(cwd?: string): Promise<string[]> {
	const { stdout } = await runGit(['branch', '-a'], cwd);
	return parseBranchList(stdout);
}

export interface Worktree {
	path: string;
	branch: string | null;
}

/** Parses `git worktree list --porcelain` output. */
export function parseWorktreeList(stdout: string): Worktree[] {
	const worktrees: Worktree[] = [];
	let current: Partial<Worktree> | null = null;
	for (const line of stdout.split('\n')) {
		if (line.startsWith('worktree ')) {
			if (current?.path) worktrees.push({ path: current.path, branch: current.branch ?? null });
			current = { path: line.slice('worktree '.length) };
		} else if (line.startsWith('branch ')) {
			if (current) current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
		}
	}
	if (current?.path) worktrees.push({ path: current.path, branch: current.branch ?? null });
	return worktrees;
}

/** Parsed `git worktree list --porcelain` output. */
export async function listWorktrees(cwd?: string): Promise<Worktree[]> {
	const { stdout } = await runGit(['worktree', 'list', '--porcelain'], cwd);
	return parseWorktreeList(stdout);
}
