import { execa } from 'execa';

export interface GhResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export async function runGh(args: string[], options?: { cwd?: string; input?: string }): Promise<GhResult> {
	const result = await execa('gh', args, { cwd: options?.cwd, input: options?.input, reject: false });
	return {
		stdout: result.stdout,
		stderr: result.stderr,
		exitCode: result.exitCode ?? 1,
	};
}

export class GhCommandError extends Error {
	constructor(
		public args: string[],
		public stderr: string
	) {
		super(`gh ${args.join(' ')} failed: ${stderr}`);
	}
}

/** Runs a `gh ... --json ...` command and parses stdout as JSON. Throws GhCommandError on failure. */
export async function ghJson<T>(args: string[], cwd?: string): Promise<T> {
	const result = await runGh(args, { cwd });
	if (result.exitCode !== 0) throw new GhCommandError(args, result.stderr);
	return JSON.parse(result.stdout) as T;
}

/** Parses `gh label list`'s tab-separated output into label names. */
export function parseLabelNames(stdout: string): string[] {
	return stdout
		.split('\n')
		.map((line) => line.split('\t')[0]?.trim())
		.filter((name): name is string => Boolean(name));
}

export async function listLabelNames(cwd?: string): Promise<string[]> {
	const { stdout, exitCode, stderr } = await runGh(['label', 'list'], { cwd });
	if (exitCode !== 0) throw new GhCommandError(['label', 'list'], stderr);
	return parseLabelNames(stdout);
}
