import { headers } from 'next/headers';

// Server Components (layouts included) only ever receive `params` for the
// dynamic segments up to and including their own position in the route tree
// — never a deeper segment's static path (the root layout, `app/layout.tsx`,
// has no dynamic segments at all, so it can't see that a request is for a
// group's `summary` subtree purely from its own `params`). `proxy.ts` stamps
// the real request pathname onto this header on every `/group/**` request so
// the root layout's auth gate can still make a subtree-specific decision
// (`lib/public-group-access.ts`).
export const REQUEST_PATHNAME_HEADER = 'x-pathname';

export async function getRequestPathname(): Promise<string | null> {
	const headerList = await headers();
	return headerList.get(REQUEST_PATHNAME_HEADER);
}
