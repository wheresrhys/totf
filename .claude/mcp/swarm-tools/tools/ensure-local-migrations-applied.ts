import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { execa } from 'execa';
import {
	readMigrationMarker,
	withMigrationMarkerLock,
	readHighestOnDiskMigrationVersion,
	markerIsCaughtUp,
} from '../lib/migration-marker';

/**
 * Catches a worktree's *shared local* Postgres up to the migrations already committed on disk,
 * cheaply. Since #862 committed `supabase/migrations/` to the repo, a worktree branched before a
 * migration merged can be missing it locally; but every worktree points at the one local Supabase
 * instance, so only the first worktree to notice a new version needs to run the CLI. A persisted
 * marker (see `lib/migration-marker.ts`) records how far that instance has been caught up, letting
 * every sibling short-circuit. Concurrency is guarded by swarm's existing exclusive-resource
 * solo-run rule (a `db-migration` unit already runs alone) plus the marker's own file lock — no new
 * coordination primitive.
 */

export interface MigrationUpResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

/** Runs the actual apply step. Injectable so unit tests never shell out to a real Supabase/Postgres. */
export type MigrationUpRunner = (worktreePath: string) => Promise<MigrationUpResult>;

async function defaultRunMigrationUp(worktreePath: string): Promise<MigrationUpResult> {
	const result = await execa('npx', ['supabase', 'migration', 'up', '--local'], {
		cwd: worktreePath,
		reject: false,
	});
	return {
		exitCode: result.exitCode ?? 1,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

export type EnsureStatus = 'no-migrations' | 'already-applied' | 'applied' | 'error';

export interface EnsureResult {
	status: EnsureStatus;
	/** Highest 14-digit migration version present in the worktree's `supabase/migrations/`, or null when none. */
	highestOnDisk: string | null;
	/** The persisted marker value before this call. */
	previousMarker: string | null;
	/** The persisted marker value after this call (unchanged unless `status === 'applied'`). */
	marker: string | null;
	/** CLI output, present only when the apply step actually ran (`applied` / `error`). */
	stdout?: string;
	stderr?: string;
}

export interface EnsureOptions {
	/** Directory used to resolve the shared marker file's location (defaults to `worktreePath`). */
	cwd?: string;
	runMigrationUp?: MigrationUpRunner;
}

/**
 * Fast path (no lock, no CLI) when the marker is already ≥ the highest on-disk version. Otherwise
 * takes the marker lock, re-checks (a sibling worktree may have applied it in the gap), runs
 * `npx supabase migration up --local`, and persists the new marker only on a clean exit — a CLI
 * failure leaves the marker stale so the next caller retries rather than skipping the gap.
 */
export async function ensureLocalMigrationsApplied(
	worktreePath: string,
	options: EnsureOptions = {}
): Promise<EnsureResult> {
	const cwd = options.cwd ?? worktreePath;
	const runMigrationUp = options.runMigrationUp ?? defaultRunMigrationUp;

	const highestOnDisk = await readHighestOnDiskMigrationVersion(worktreePath);
	if (highestOnDisk === null) {
		const marker = await readMigrationMarker(cwd);
		return {
			status: 'no-migrations',
			highestOnDisk: null,
			previousMarker: marker.lastAppliedMigrationVersion,
			marker: marker.lastAppliedMigrationVersion,
		};
	}

	const snapshot = await readMigrationMarker(cwd);
	if (markerIsCaughtUp(snapshot, highestOnDisk)) {
		return {
			status: 'already-applied',
			highestOnDisk,
			previousMarker: snapshot.lastAppliedMigrationVersion,
			marker: snapshot.lastAppliedMigrationVersion,
		};
	}

	return withMigrationMarkerLock(async (marker) => {
		if (markerIsCaughtUp(marker, highestOnDisk)) {
			return {
				marker,
				result: {
					status: 'already-applied',
					highestOnDisk,
					previousMarker: marker.lastAppliedMigrationVersion,
					marker: marker.lastAppliedMigrationVersion,
				},
			};
		}

		const previousMarker = marker.lastAppliedMigrationVersion;
		const run = await runMigrationUp(worktreePath);
		if (run.exitCode !== 0) {
			return {
				marker,
				result: {
					status: 'error',
					highestOnDisk,
					previousMarker,
					marker: previousMarker,
					stdout: run.stdout,
					stderr: run.stderr,
				},
			};
		}

		return {
			marker: { lastAppliedMigrationVersion: highestOnDisk },
			result: {
				status: 'applied',
				highestOnDisk,
				previousMarker,
				marker: highestOnDisk,
				stdout: run.stdout,
				stderr: run.stderr,
			},
		};
	}, cwd);
}

export function registerEnsureLocalMigrationsAppliedTool(server: McpServer) {
	server.registerTool(
		'ensure_local_migrations_applied',
		{
			description:
				"Catch a worktree's shared local Postgres up to the migrations committed on disk before DB-dependent work starts. Fast-paths (no Supabase CLI, no Postgres) when a persisted marker in .claude/swarm-migration-state.json is already at/beyond the highest 14-digit migration version in the worktree's supabase/migrations/. Only when behind does it run `npx supabase migration up --local` and advance the marker. status: 'no-migrations' (empty dir), 'already-applied' (fast path or a sibling worktree got there first), 'applied' (ran the CLI, marker advanced), 'error' (CLI failed — marker left stale for a retry).",
			inputSchema: {
				worktreePath: z.string(),
			},
			outputSchema: {
				status: z.enum(['no-migrations', 'already-applied', 'applied', 'error']),
				highestOnDisk: z.string().nullable(),
				previousMarker: z.string().nullable(),
				marker: z.string().nullable(),
				stdout: z.string().optional(),
				stderr: z.string().optional(),
			},
		},
		async ({ worktreePath }) => {
			const structuredContent = await ensureLocalMigrationsApplied(worktreePath);
			return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
		}
	);
}
