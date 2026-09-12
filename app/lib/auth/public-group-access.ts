import {
	resolveGroupIdBySlug,
	resolveGroupPublicAreasForRequest
} from '../group-slug';

// Matches `/group/<slug>/summary`, `/group/<slug>/summary/<year>`, or
// `/group/<slug>/summary/<year>/<month>` — the only subtree a group can
// currently publish (`public_areas` only allows `'summary'`, #768). Every
// other route keeps requiring a session cookie regardless of the target
// group's public_areas (#770's "out of scope: any area other than summary").
const PUBLIC_SUMMARY_PATH_PATTERN = /^\/group\/([^/]+)\/summary(\/|$)/;

// Resolves an anonymous (no-cookie) request's pathname to the id of the
// group whose public summary it's requesting, or null if it isn't a public
// summary request at all (wrong path shape, unknown slug, or the target
// group hasn't opted 'summary' into `public_areas`). The root layout uses
// the id (rather than a bare boolean) to look up the group's display name
// for the read-only `GlobalNav` it still renders on this path (#770 review
// feedback — an anonymous visitor needs to see whose data they're looking
// at, same as a logged-in viewer would).
export async function resolvePublicPageViewedGroupId(
	pathname: string | null
): Promise<number | null> {
	const match = pathname?.match(PUBLIC_SUMMARY_PATH_PATTERN);
	if (!match) {
		return null;
	}

	const viewedGroupId = await resolveGroupIdBySlug(match[1]);
	if (!viewedGroupId) {
		return null;
	}

	const publicAreas = await resolveGroupPublicAreasForRequest(viewedGroupId);
	return publicAreas.includes('summary') ? viewedGroupId : null;
}
