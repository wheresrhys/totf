'use client';
import { createContext, useContext } from 'react';

// The focused tab id, published to a tab page's whole subtree (#1013). Every
// component that owns tab state via `useLinkableTabs` wraps its `TabNav` + tab
// panels in `CurrentTabProvider`, so anything rendered inside a tab — however
// deeply nested, and without prop-threading through the tables in between —
// can ask which tab it is being rendered in. `TabAwareLink` is the one consumer
// today: it appends the focused tab to its href so a drill-down link lands on
// the equivalent tab of the target page.
//
// `undefined` is the deliberate default rather than an error-throwing hook:
// plenty of the components that render a `TabAwareLink` (e.g. the shared
// `createNameLinkCell` drill-down cell, used by the `/species` list page as
// well as inside tab panels) are legitimately rendered with no tab context at
// all, and must simply leave the href alone there.
const CurrentTabContext = createContext<string | undefined>(undefined);

export function useCurrentTabId(): string | undefined {
	return useContext(CurrentTabContext);
}

export function CurrentTabProvider({
	currentTabId,
	children
}: {
	currentTabId: string;
	children: React.ReactNode;
}) {
	return (
		<CurrentTabContext.Provider value={currentTabId}>
			{children}
		</CurrentTabContext.Provider>
	);
}
