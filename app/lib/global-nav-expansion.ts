// Which routes want GlobalNav's search/species panel expanded by default.
// A plain exact-match set, not a pattern-matcher — the home page is the only
// entry today; a future page adds its own literal path here rather than
// this growing a regex list prematurely. Pure/sync, so it's safely
// importable from both the server root layout and the client GlobalNav,
// keeping the server-rendered initial state and the client resync in sync.
const EXPAND_BIRD_NAV_PATHS = new Set(['/']);

export function shouldExpandBirdNavByDefault(pathname: string | null): boolean {
	return pathname !== null && EXPAND_BIRD_NAV_PATHS.has(pathname);
}
