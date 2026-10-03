'use client';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import { useCurrentTabId } from '@/app/components/shared/CurrentTabContext';
import { appendTabIdSearchParam } from '@/app/lib/tab-query-param';

// A `NoPrefetchLink` that carries the tab it is rendered inside onto its own
// href (#1013), so drilling from a tab into a deeper route depth reopens the
// equivalent tab there instead of resetting to that page's default. Outside any
// `CurrentTabProvider` — or for an href that already names a `tabId`, or one
// that isn't a root-relative internal path — it is exactly a `NoPrefetchLink`.
//
// `href` is narrowed to `string`: every link in this app passes a string, and
// appending a search param to a `UrlObject` would need a second code path for
// no current caller (YAGNI).
export function TabAwareLink({
	href,
	children,
	...props
}: Omit<React.ComponentProps<typeof NoPrefetchLink>, 'href'> & {
	href: string;
}) {
	const currentTabId = useCurrentTabId();
	return (
		<NoPrefetchLink
			{...props}
			href={appendTabIdSearchParam(href, currentTabId)}
		>
			{children}
		</NoPrefetchLink>
	);
}
