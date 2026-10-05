'use client';
import { useEffect, useRef, useState } from 'react';
import type { ViewedGroup } from '@/app/lib/group-slug';

// The tab-level analogue of `BootstrapPage.tsx`'s `BootstrapPageProps` — same
// `params`/`data`/`viewedGroup`/`___Component` shape, scoped to a single tab
// rather than a whole page. `dataFetcher` is deliberately optional (not a
// discriminated union): tabs that manage their own internal
// fetching/pagination render immediately with `data: null` and never call it.
export type TabConfig<DataType, ParamsType> = {
	id: string;
	label: string;
	/**
	 * This tab's own params, used in place of the shared `params` a `TabSet`
	 * threads to every tab. Omit it — the common case — and the tab is handed
	 * the set's shared params instead; supply it when this one tab needs a
	 * different shape entirely, in which case its `ParamsType` is independent
	 * of every other tab's in the same set (see `TabConfigInSet` below, which
	 * is what turns this into a *required* property for such a tab).
	 *
	 * `NoInfer` so a tab's `ParamsType` is always pinned by the two things that
	 * actually have to agree on it — `dataFetcher` and `TabComponent` — rather
	 * than being widened to `ParamsType | undefined` by this optional property
	 * when inferred from a `TabConfig`-typed array.
	 */
	params?: NoInfer<ParamsType>;
	dataFetcher?: (
		params: ParamsType,
		viewedGroup: ViewedGroup
	) => Promise<DataType | null>;
	/**
	 * Declare this tab's `dataFetcher` client-side only: `prefetchActiveTabData`
	 * refuses to run it on the server even when the URL deep-linked straight
	 * into this tab, so the page still renders with the tab focused, but
	 * `TabContent` fetches it after hydration — spinner first, content once the
	 * browser-side fetch resolves. Nothing else changes; this is purely about
	 * *where* the fetch runs.
	 *
	 * For a tab whose data is deliberately produced in the browser rather than
	 * on the server. Highlights are the case this exists for: generating them
	 * client-side is a conscious caching/performance decision, so a server-side
	 * prefetch would quietly undo it — and a `dataFetcher` that lives in a
	 * `'use client'` module is only a client reference on the server anyway, so
	 * calling it there would throw rather than fetch.
	 */
	clientSideOnly?: boolean;
	TabComponent: (props: {
		params: ParamsType;
		data: DataType | null;
		viewedGroup: ViewedGroup;
	}) => React.ReactNode;
};

/**
 * One tab's entry in a set of tabs that also carries *shared* params — the
 * single source of truth for "a tab the shared params can't satisfy must
 * declare its own". Both consumers of a tabs array apply it, so the client
 * (`TabSet`) and server (`prefetchActiveTabData`) halves can't drift into
 * disagreeing about which tabs are legal.
 *
 * `TabShape` is whichever config shape the consumer takes — a whole
 * `TabConfig` for `TabSet`, the `id`/`dataFetcher`/`params` subset for
 * `prefetchActiveTabData`. The two cases are:
 *  - `OwnParamsType` is satisfied by the shared params (identical to them, or
 *    a subset of them) — the tab may just omit `params` and be handed the
 *    shared ones,
 *  - it isn't — the tab *must* carry its own `params`, and intersecting the
 *    required property over `TabConfig`'s optional one makes forgetting it a
 *    compile error rather than a runtime shape mismatch.
 *
 * `[SharedParamsType] extends [OwnParamsType]` is wrapped in tuples to stop
 * the check distributing over a union-typed `SharedParamsType`.
 */
export type TabConfigInSet<SharedParamsType, OwnParamsType, TabShape> = [
	SharedParamsType
] extends [OwnParamsType]
	? TabShape
	: TabShape & { params: NoInfer<OwnParamsType> };

/**
 * Runs one `TabConfig`: fetches its data once (or skips the fetch entirely
 * when `initialData` is already supplied, e.g. via a server-side
 * `prefetchActiveTabData`), shows a loading state meanwhile, and shows a
 * visible error state on failure instead of hanging forever — the bug this
 * replaces in `SpHighlightsTab.tsx`, which has no `.catch` at all.
 */
export function TabContent<DataType, ParamsType>({
	dataFetcher,
	TabComponent,
	params,
	viewedGroup,
	initialData,
	loadingMessage
}: {
	dataFetcher?: (
		params: ParamsType,
		viewedGroup: ViewedGroup
	) => Promise<DataType | null>;
	TabComponent: (props: {
		params: ParamsType;
		data: DataType | null;
		viewedGroup: ViewedGroup;
	}) => React.ReactNode;
	params: ParamsType;
	viewedGroup: ViewedGroup;
	initialData?: DataType | null;
	loadingMessage?: string;
}) {
	// "Already supplied" means the prop was passed at all (including an
	// explicit `null` — a prefetch that found no data) — distinguished from
	// "not supplied" by presence, not truthiness.
	const hasInitialData = initialData !== undefined;
	const [data, setData] = useState<DataType | null>(initialData ?? null);
	const [isLoading, setIsLoading] = useState(
		dataFetcher !== undefined && !hasInitialData
	);
	const [error, setError] = useState<unknown>(undefined);
	// Guards against refetching: survives React StrictMode's double effect
	// invocation, same pattern as `useLazyTabData`'s `hasFetchedRef`.
	const hasFetchedRef = useRef(false);

	// `dataFetcher`/`params`/`viewedGroup`/`hasInitialData` are intentionally
	// excluded from the dependency list: the ref guard already ensures a
	// single fetch for this component's mounted lifetime, and re-running the
	// effect on every params/viewedGroup change would refetch instead of
	// staying "fetch once" — see `useLazyTabData`'s identical rationale.
	useEffect(() => {
		if (!dataFetcher || hasInitialData || hasFetchedRef.current) return;
		hasFetchedRef.current = true;
		dataFetcher(params, viewedGroup)
			.then((result) => setData(result))
			.catch((caughtError) => {
				console.error('Failed to fetch tab data', {
					groupId: viewedGroup.id,
					error: caughtError
				});
				setError(caughtError);
			})
			.finally(() => setIsLoading(false));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	if (error !== undefined) {
		return (
			<p role="alert" className="text-error">
				Something went wrong loading this tab. Please try again later.
			</p>
		);
	}

	if (isLoading) {
		return (
			<div className="flex flex-col items-center justify-center gap-2">
				<div className="loading loading-spinner loading-xl"></div>
				{loadingMessage && <p>{loadingMessage}</p>}
			</div>
		);
	}

	return <TabComponent params={params} data={data} viewedGroup={viewedGroup} />;
}
