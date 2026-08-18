/**
 * Convert a display name (e.g. a RingingGroups.group_name) into a URL-safe slug:
 * lowercase, ASCII alphanumerics only, words separated by a single hyphen.
 *
 * Non-ASCII/accented characters are stripped rather than transliterated — e.g.
 * "Café Ringers" -> "caf-ringers", not "cafe-ringers". No existing repo pattern
 * transliterates, and the task didn't specify it, so this is the simplest correct
 * default (see #473).
 */
export function slugify(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^\x00-\x7F]/g, '') // strip non-ASCII characters entirely
		.replace(/[^a-z0-9]+/g, '-') // collapse runs of symbols/whitespace/underscores into a single hyphen
		.replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
}
