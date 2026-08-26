import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	PORT_RANGE_END,
	PORT_RANGE_START,
	deriveWorktreePort
} from '../worktree-test-port';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

/** Every port the local Supabase stack reserves, parsed from supabase/config.toml. */
function reservedSupabasePorts(): number[] {
	const config = readFileSync(
		path.join(repoRoot, 'supabase', 'config.toml'),
		'utf8'
	);
	const ports = new Set<number>();
	for (const line of config.split('\n')) {
		// Only real assignments — skip commented-out `# port = ...` lines.
		const match = /^[a-z_]*port\s*=\s*(\d+)/i.exec(line.trim());
		if (match) ports.add(Number(match[1]));
	}
	return [...ports];
}

const MAIN_CHECKOUT_PATH = '/Users/someone/Projects/top-of-the-flocks';
const WORKTREE_PATH =
	'/Users/someone/Projects/top-of-the-flocks/.claude/worktrees/agent-a017a9b60914ab058';

describe('deriveWorktreePort', () => {
	// Usual
	it('returns a port number within the configured range for a typical worktree path', () => {
		const port = deriveWorktreePort(WORKTREE_PATH);
		expect(port).toBeGreaterThanOrEqual(PORT_RANGE_START);
		expect(port).toBeLessThanOrEqual(PORT_RANGE_END);
		expect(Number.isInteger(port)).toBe(true);
	});

	it('returns the same port for the same path across repeated calls', () => {
		const first = deriveWorktreePort(WORKTREE_PATH);
		const second = deriveWorktreePort(WORKTREE_PATH);
		const third = deriveWorktreePort(WORKTREE_PATH);
		expect(second).toBe(first);
		expect(third).toBe(first);
	});

	// Structure
	it('returns different ports for two different worktree paths', () => {
		expect(deriveWorktreePort(MAIN_CHECKOUT_PATH)).not.toBe(
			deriveWorktreePort(WORKTREE_PATH)
		);
	});

	it('defaults to process.cwd() when no path argument is given', () => {
		expect(deriveWorktreePort()).toBe(deriveWorktreePort(process.cwd()));
	});

	// Edge
	it('returns a port outside every reserved range (3000, and every port declared in supabase/config.toml) by construction', () => {
		const reserved = [3000, ...reservedSupabasePorts()];
		// Sanity: we actually parsed the Supabase ports (e.g. 54321, 54322).
		expect(reserved).toContain(54321);
		for (const reservedPort of reserved) {
			const overlapsRange =
				reservedPort >= PORT_RANGE_START && reservedPort <= PORT_RANGE_END;
			expect(overlapsRange).toBe(false);
		}
	});

	it('returns a port within range for an empty-string path without throwing', () => {
		const port = deriveWorktreePort('');
		expect(port).toBeGreaterThanOrEqual(PORT_RANGE_START);
		expect(port).toBeLessThanOrEqual(PORT_RANGE_END);
	});

	it('returns a port within range for a very long nested worktree path without throwing', () => {
		const longPath = `/Users/someone/Projects/top-of-the-flocks/.claude/worktrees/agent-${'a1b2c3d4e5'.repeat(
			4
		)}`;
		const port = deriveWorktreePort(longPath);
		expect(port).toBeGreaterThanOrEqual(PORT_RANGE_START);
		expect(port).toBeLessThanOrEqual(PORT_RANGE_END);
	});
});
