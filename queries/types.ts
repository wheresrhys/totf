/**
 * Canonical definition of one non-trivial `.select()`-based PostgREST query the
 * app issues directly against a table (as opposed to an RPC — those already
 * have a canonical name, the RPC function itself, so this directory
 * deliberately doesn't cover them; see #913).
 *
 * Both `scripts/generate-snapshots.ts` (which fixture to write, and under what
 * name) and the app's own call sites import a query's `select` string from
 * here instead of duplicating it inline — that duplication, and the drift it
 * allowed between a fixture's name and what it actually tested, is what #913
 * removes.
 */
export type TableQueryDefinition = {
	/** Root table this query selects from — the `tables/<table>/` fixture subdirectory it belongs to. */
	table: string;
	/**
	 * Descriptive, filename-safe name for this query, e.g. `'all-sessions'` —
	 * the `<intent>` segment of its fixture filename(s)
	 * (`<callingGroupOrParams>.<intent>.json`, see CLAUDE.md's fixture-naming
	 * convention).
	 */
	name: string;
	/** The PostgREST `.select()` argument shared by every consumer of this query. */
	select: string;
	/**
	 * Fixture path(s) (relative to `test-fixtures/snapshots/`) this query
	 * backs. Usually one; a query captured for more than one seed group (e.g.
	 * Sessions' all-sessions query, captured for both Alpha and Beta) lists one
	 * path per group.
	 */
	fixturePaths: readonly string[];
};
