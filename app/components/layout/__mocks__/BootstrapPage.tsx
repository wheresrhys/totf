import { useState, useEffect } from 'react';
import {
	defaultGetParams,
	type BootstrapPageProps,
	type DefaultPageParams,
	type DefaultPageProps
} from '../BootstrapPage';

// Re-exported so `page.tsx` files that import `defaultGetParams` alongside
// `BootstrapPage` from the same module (to merge route params with an extra
// search param, e.g. #803's `?tabId=`) keep working under this whole-module
// mock — `vi.mock('./app/components/layout/BootstrapPage')` (vitest.setup.tsx)
// replaces every named export with whatever this file defines.
export { defaultGetParams };

export function BootstrapPage<
	DataType,
	PagePropsType = DefaultPageProps,
	ParamsType = DefaultPageParams
>(bootstrapProps: BootstrapPageProps<DataType, PagePropsType, ParamsType>) {
	const [data, setData] = useState<DataType | null>(null);
	const [params, setParams] = useState<ParamsType | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let mounted = true;

		async function loadData() {
			try {
				let resolvedParams: ParamsType;
				if (bootstrapProps.getParams) {
					resolvedParams = await bootstrapProps.getParams(
						bootstrapProps.pageProps as PagePropsType
					);
				} else if (bootstrapProps.pageProps) {
					resolvedParams = (await defaultGetParams(
						bootstrapProps.pageProps
					)) as ParamsType;
				} else {
					resolvedParams = {} as ParamsType;
				}

				if (!mounted) return;
				setParams(resolvedParams);
				const fetchedData = await bootstrapProps.dataFetcher(
					resolvedParams,
					1,
					{ id: 1, slug: 'alpha' }
				);
				if (!mounted) return;
				setData(fetchedData);
			} catch (error) {
				console.error('Error loading data in BootstrapPage mock:', error);
				if (mounted) setData(null);
			} finally {
				if (mounted) setIsLoading(false);
			}
		}

		loadData();
		return () => {
			mounted = false;
		};
	}, [bootstrapProps]);

	if (isLoading) {
		return <>{bootstrapProps.loading || <div>Loading...</div>}</>;
	}

	if (!data || !params) {
		return <div>No data available</div>;
	}

	return (
		<bootstrapProps.PageComponent
			params={params}
			data={data}
			viewedGroup={{ id: 1, slug: 'alpha' }}
		/>
	);
}
