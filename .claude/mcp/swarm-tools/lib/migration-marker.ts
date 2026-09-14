import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import { resolveMainCheckoutRoot, readFileOrNull, withLockedJsonFile } from './locked-json-file';

/**
 * Supabase migration versions are the 14-digit timestamp (`YYYYMMDDHHMMSS`) prefix of the
 * migration filename, followed by `_<name>.sql` (e.g. `20260626120903_declarative_sync.sql`).
 * Anchored to the start and requiring the `_` separator so it extracts exactly the version prefix.
 * (A bare `\b\d{14}\b` — as the removed `apply-schema-migration.ts` used to scan CLI *output* —
 * does not work on filenames: the trailing `_` is a word character, so there is no word boundary
 * after the digits.) Because the width is fixed, plain lexicographic string comparison of two
 * version strings is equivalent to chronological ordering — so we never parse them to numbers.
 */
export const MIGRATION_FILENAME_VERSION_PATTERN = /^(\d{14})_/;

/**
 * The persisted "how far has the *shared local* Postgres been caught up to committed migrations?"
 * marker. Lives beside `.claude/swarm-state.json` in the main checkout (shared across every
 * worktree, which all point at the one local Supabase instance), so the first worktree to apply a
 * newly-merged migration records it here and every sibling worktree then hits the cheap fast path
 * instead of re-shelling the Supabase CLI. `lastAppliedMigrationVersion` is `null` before anything
 * has ever been applied through this tool.
 */
const migrationMarkerSchema = z.object({
	lastAppliedMigrationVersion: z.string().nullable(),
});

export type MigrationMarker = z.infer<typeof migrationMarkerSchema>;

const EMPTY_MARKER: MigrationMarker = { lastAppliedMigrationVersion: null };

const MARKER_FILENAME = 'swarm-migration-state.json';

/** Thrown when `.claude/swarm-migration-state.json` on disk doesn't match {@link migrationMarkerSchema}. */
export class MigrationMarkerSchemaError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'MigrationMarkerSchemaError';
	}
}

async function resolveMarkerPath(cwd: string): Promise<string> {
	const root = await resolveMainCheckoutRoot(cwd);
	return path.join(root, '.claude', MARKER_FILENAME);
}

function parseMarker(raw: string | null): MigrationMarker {
	if (raw === null) return { ...EMPTY_MARKER };
	const parsed: unknown = JSON.parse(raw);
	const result = migrationMarkerSchema.safeParse(parsed);
	if (!result.success) {
		throw new MigrationMarkerSchemaError(
			`${MARKER_FILENAME} does not match the expected { lastAppliedMigrationVersion } shape`
		);
	}
	return result.data;
}

function serializeMarker(marker: MigrationMarker): string {
	return JSON.stringify(marker, null, 2) + '\n';
}

/** Unlocked snapshot read of the marker (used for the cheap fast-path pre-check). */
export async function readMigrationMarker(cwd: string = process.cwd()): Promise<MigrationMarker> {
	const markerPath = await resolveMarkerPath(cwd);
	return parseMarker(await readFileOrNull(markerPath));
}

/**
 * Locked read-modify-write of the marker file, mirroring `state-file.ts`'s `withStateLock`. The
 * concurrency guarantee is the same: two worktrees advancing the marker at once are serialized, so
 * neither update is lost.
 */
export async function withMigrationMarkerLock<T>(
	mutate: (marker: MigrationMarker) => { marker: MigrationMarker; result: T } | Promise<{ marker: MigrationMarker; result: T }>,
	cwd: string = process.cwd()
): Promise<T> {
	const markerPath = await resolveMarkerPath(cwd);
	return withLockedJsonFile<MigrationMarker, T>(markerPath, {
		parse: parseMarker,
		serialize: serializeMarker,
		mutate: async (marker) => {
			const { marker: next, result } = await mutate(marker);
			return { state: next, result };
		},
	});
}

/**
 * Highest 14-digit migration version present in `<worktreePath>/supabase/migrations/`, or `null`
 * when the directory is absent/empty or holds no timestamp-prefixed `.sql` file. Derived purely
 * from filenames (not mtime or directory listing order), so it's stable regardless of how the
 * filesystem happens to enumerate the directory.
 */
export async function readHighestOnDiskMigrationVersion(worktreePath: string): Promise<string | null> {
	const migrationsDir = path.join(worktreePath, 'supabase', 'migrations');
	let names: string[];
	try {
		names = await fs.readdir(migrationsDir);
	} catch {
		return null;
	}
	let highest: string | null = null;
	for (const name of names) {
		if (!name.endsWith('.sql')) continue;
		const match = MIGRATION_FILENAME_VERSION_PATTERN.exec(name);
		if (!match) continue;
		const version = match[1];
		if (highest === null || version > highest) highest = version;
	}
	return highest;
}

/**
 * True when a persisted marker is at or beyond the highest on-disk version — the fast-path
 * condition. Fixed-width 14-digit strings compare chronologically under `>=`.
 */
export function markerIsCaughtUp(marker: MigrationMarker, highestOnDisk: string): boolean {
	return marker.lastAppliedMigrationVersion !== null && marker.lastAppliedMigrationVersion >= highestOnDisk;
}
