import { createHash } from 'node:crypto';

/**
 * Deterministic per-worktree test-server port.
 *
 * Why: `/swarm` runs up to 4 concurrent git worktrees against one host. Both
 * `playwright.config.ts` and `http-tests/global-setup.ts` used to default their
 * dev server to `http://localhost:3000` with `reuseExistingServer` on, so a
 * worktree's E2E/HTTP run would silently attach to whatever sibling worktree's
 * `next dev` already held port 3000 — running tests against the wrong worktree's
 * code with no error or warning (see issue #581).
 *
 * Deriving the default port from the absolute worktree path fixes this
 * structurally: each worktree gets its own port, so "reuse an existing server"
 * can only ever re-attach to a server *this same worktree* started, never a
 * sibling's. The derivation is a pure hash of the path — same path always maps
 * to the same port (a worktree's sequential runs, or a human re-running tests by
 * hand, keep hitting the same port), and different paths map to different ports
 * with overwhelming probability, with no external counter or registry to keep.
 */

/**
 * Fixed port range for derived test-server ports. Chosen to avoid the
 * conventional `3000` dev port and every port declared in
 * `supabase/config.toml` for the local Supabase stack (54320–54324, 54327,
 * 54329, 8083). 10 000 ports keep collisions vanishingly unlikely at swarm's
 * concurrency cap.
 */
export const PORT_RANGE_START = 20000;
export const PORT_RANGE_END = 29999;

const PORT_RANGE_SIZE = PORT_RANGE_END - PORT_RANGE_START + 1;

/**
 * Derive a stable test-server port from an absolute worktree path.
 *
 * @param worktreePath Absolute path of the worktree. Defaults to
 *   `process.cwd()`, which for any test run is the worktree root.
 * @returns A port in `[PORT_RANGE_START, PORT_RANGE_END]`.
 */
export function deriveWorktreePort(
	worktreePath: string = process.cwd()
): number {
	const hash = createHash('sha256').update(worktreePath).digest();
	const offset = hash.readUInt32BE(0) % PORT_RANGE_SIZE;
	return PORT_RANGE_START + offset;
}
