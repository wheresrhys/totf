import { notFound } from 'next/navigation';
import { resolveGroupIdBySlug, type ViewedGroup } from '@/app/lib/group-slug';

// Shared group-scoping wrapper for `/group/[groupSlug]/**` route pages.
//
// Every `Group___Page` under app/(routes)/group/[groupSlug]/ repeats the same
// boilerplate: await `params`, resolve the `groupSlug` to a numeric group id,
// `notFound()` on a miss, then build the `{ id, slug }` `ViewedGroup` object to
// hand to the underlying (non-group-scoped) route page. `withGroupScope`
// factors that out so each page becomes a one-liner that only expresses what is
// unique to it — which child component to render and how to map any extra route
// params onto it.
//
// Why a higher-order function rather than a wrapper component or a React
// context provider (as the issue floated): these route pages are async server
// components, and React context (createContext/useContext) is a client-only
// feature that cannot be read from a server component, so a provider can't
// deliver `viewedGroup` to a server-rendered child. A HOF that owns the whole
// page function eliminates the most boilerplate (the per-page `await params`
// and null-check disappear entirely) while staying completely ignorant of the
// child component's own props — the caller's `renderPage` callback is the only
// thing that knows them.

type GroupScopedParams<ExtraParams> = { groupSlug: string } & ExtraParams;

export type GroupScopeContext<ExtraParams> = {
	viewedGroup: ViewedGroup;
	params: ExtraParams;
	searchParams?: Promise<{ tabId?: string }>;
};

/**
 * Wrap a group-scoped route page. Returns an async page component that resolves
 * `groupSlug` from the route params to a `ViewedGroup`, calls `notFound()` when
 * the slug is unknown, and otherwise invokes `renderPage` with the resolved
 * `viewedGroup` plus any remaining (non-`groupSlug`) route params.
 *
 * `renderPage` may be sync or async — an async callback lets a page do extra
 * work after resolution (e.g. the cross-group home page's redirect-to-own-group
 * check) before returning its element.
 *
 * `searchParams` (#805) is optional and passed through unmodified — Next.js
 * supplies it to every page component regardless of whether the component's
 * declared type mentions it, but most `withGroupScope` callers don't care
 * about it, so it's not defaulted or unwrapped here. A `renderPage` that wants
 * a `?tabId=` deep link (e.g. the session page) reads it via
 * `readTabIdSearchParam` in its own `getParams`.
 */
export function withGroupScope<ExtraParams = Record<never, never>>(
	renderPage: (
		context: GroupScopeContext<ExtraParams>
	) => React.ReactNode | Promise<React.ReactNode>
) {
	return async function GroupScopedPage({
		params,
		searchParams
	}: {
		params: Promise<GroupScopedParams<ExtraParams>>;
		searchParams?: Promise<{ tabId?: string }>;
	}) {
		const { groupSlug, ...extraParams } = await params;
		const viewedGroupId = await resolveGroupIdBySlug(groupSlug);
		if (viewedGroupId === null) {
			notFound();
		}
		const viewedGroup: ViewedGroup = { id: viewedGroupId, slug: groupSlug };
		return renderPage({
			viewedGroup,
			params: extraParams as ExtraParams,
			searchParams
		});
	};
}
