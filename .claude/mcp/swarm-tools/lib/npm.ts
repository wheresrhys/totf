import { execa } from 'execa';

export interface NpmResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

/** Runs an `npm ...` command, capturing stdout/stderr without throwing on a non-zero exit. */
export async function runNpm(args: string[], cwd?: string): Promise<NpmResult> {
	const result = await execa('npm', args, { cwd, reject: false });
	return {
		stdout: result.stdout,
		stderr: result.stderr,
		exitCode: result.exitCode ?? 1,
	};
}
