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
	dataFetcher?: (
		params: ParamsType,
		viewedGroup: ViewedGroup
	) => Promise<DataType | null>;
	TabComponent: (props: {
		params: ParamsType;
		data: DataType | null;
		viewedGroup: ViewedGroup;
	}) => React.ReactNode;
};

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
					viewedGroupId: viewedGroup.id,
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
