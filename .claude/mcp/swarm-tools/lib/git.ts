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

/**
 * Parses `git branch -a` output into branch names, with `remotes/origin/` stripped and deduped.
 * Strips both the `*` (current branch) and `+` (checked out in another worktree) leading markers.
 */
export function parseBranchList(stdout: string): string[] {
	const names = stdout
		.split('\n')
		.map((line) => line.replace(/^[*+]?\s+/, '').trim())
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

/** The committer date (ISO 8601) and subject line of a branch's tip commit. */
export interface BranchTip {
	committedDate: string;
	subject: string;
}

/**
 * Field separator used in {@link BRANCH_TIP_FORMAT}. A literal `0x1f` (ASCII unit separator) rather
 * than a tab or a pipe, since a commit subject can legitimately contain either but never a control
 * character.
 */
const BRANCH_TIP_SEPARATOR = '\x1f';

/** `git log -1` format string producing exactly what {@link parseBranchTip} expects. */
export const BRANCH_TIP_FORMAT = `%cI${BRANCH_TIP_SEPARATOR}%s`;

/**
 * Parses `git log -1 --format=<BRANCH_TIP_FORMAT> <branch>` output. `null` for empty output (a
 * branch that doesn't resolve, or a repo with no commits). Only the first separator splits, so a
 * subject containing one is preserved intact.
 */
export function parseBranchTip(stdout: string): BranchTip | null {
	const line = stdout.trim();
	if (!line) return null;
	const separatorIndex = line.indexOf(BRANCH_TIP_SEPARATOR);
	if (separatorIndex === -1) return { committedDate: line, subject: '' };
	return {
		committedDate: line.slice(0, separatorIndex),
		subject: line.slice(separatorIndex + BRANCH_TIP_SEPARATOR.length),
	};
}

/** The tip commit's date + subject for `branch`, or `null` if it can't be resolved. */
export async function getBranchTip(branch: string, cwd?: string): Promise<BranchTip | null> {
	const { stdout, exitCode } = await runGit(['log', '-1', `--format=${BRANCH_TIP_FORMAT}`, branch], cwd);
	if (exitCode !== 0) return null;
	return parseBranchTip(stdout);
}

/** How far a branch has diverged from a base ref, in commits each way. */
export interface AheadBehind {
	ahead: number;
	behind: number;
}

/**
 * Parses `git rev-list --left-right --count <base>...<branch>` output, which is
 * `<left>\t<right>` — left being commits reachable from `base` only (how far the branch is
 * *behind*) and right commits reachable from `branch` only (how far it is *ahead*). `null` for
 * anything that doesn't parse as two integers.
 */
export function parseAheadBehind(stdout: string): AheadBehind | null {
	const parts = stdout.trim().split(/\s+/);
	if (parts.length !== 2) return null;
	const behind = Number(parts[0]);
	const ahead = Number(parts[1]);
	if (!Number.isInteger(behind) || !Number.isInteger(ahead)) return null;
	return { ahead, behind };
}

/** Commits `branch` is ahead/behind `baseRef`, or `null` if either ref can't be resolved. */
export async function getAheadBehind(baseRef: string, branch: string, cwd?: string): Promise<AheadBehind | null> {
	const { stdout, exitCode } = await runGit(['rev-list', '--left-right', '--count', `${baseRef}...${branch}`], cwd);
	if (exitCode !== 0) return null;
	return parseAheadBehind(stdout);
}
