import {
	resolveGroupIdBySlug,
	resolveGroupPublicAreasForRequest
} from '../group-slug';

// The routes a `public_areas: ['summary']` opt-in makes anonymously
// viewable. `public_areas` still only allows the single `'summary'` tag
// (#768) — these patterns widen what that one tag grants, they do not
// introduce a second tag. Every route not matched here keeps requiring a
// session cookie regardless of the target group's public_areas.
//
// Each pattern must capture the group slug as its first group.
const PUBLIC_PATH_PATTERNS = [
	// `/group/<slug>/summary`, `/group/<slug>/summary/<year>`, or
	// `/group/<slug>/summary/<year>/<month>` (#770).
	/^\/group\/([^/]+)\/summary(\/|$)/,
	// The `/species` LIST page only (#1231) — deliberately anchored, so the
	// `/species/<name>` detail pages stay behind the login gate. Its stats
	// come from the same `SimpleStatsCache*` tables the summary subtree reads
	// (via `fetchAuthorisedCoreStats`' `'public'` branch), so no new data gate
	// is needed to serve it; the detail pages read beyond those tables and are
	// out of scope.
	/^\/group\/([^/]+)\/species\/?$/
];

// Resolves an anonymous (no-cookie) request's pathname to the id of the
// group whose public page it's requesting, or null if it isn't a public
// page request at all (wrong path shape, unknown slug, or the target
// group hasn't opted 'summary' into `public_areas`). The root layout uses
// the id (rather than a bare boolean) to look up the group's display name
// for the read-only `GlobalNav` it still renders on this path (#770 review
// feedback — an anonymous visitor needs to see whose data they're looking
// at, same as a logged-in viewer would).
export async function resolvePublicPageViewedGroupId(
	pathname: string | null
): Promise<number | null> {
	const match = pathname
		? PUBLIC_PATH_PATTERNS.reduce<RegExpMatchArray | null>(
				(found, pattern) => found ?? pathname.match(pattern),
				null
			)
		: null;
	if (!match) {
		return null;
	}

	const groupId = await resolveGroupIdBySlug(match[1]);
	if (!groupId) {
		return null;
	}

	const publicAreas = await resolveGroupPublicAreasForRequest(groupId);
	return publicAreas.includes('summary') ? groupId : null;
}
