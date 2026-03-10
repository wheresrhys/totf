import { useState, useEffect } from 'react';
import {
	defaultGetParams,
	type BootstrapPageDataProps,
	type DefaultPageParams,
	type DefaultPageProps
} from '../BootstrapPageData';

export function BootstrapPageData<
	DataType,
	PagePropsType = DefaultPageProps,
	ParamsType = DefaultPageParams
>(bootstrapProps: BootstrapPageDataProps<DataType, PagePropsType, ParamsType>) {
	const [data, setData] = useState<DataType | null>(null);
	const [params, setParams] = useState<ParamsType | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
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

				setParams(resolvedParams);
				const fetchedData = await bootstrapProps.dataFetcher(
					resolvedParams,
					null
				);
				setData(fetchedData);
			} catch (error) {
				console.error('Error loading data in BootstrapPageData mock:', error);
				setData(null);
			} finally {
				setIsLoading(false);
			}
		}

		loadData();
	}, [bootstrapProps]);

	if (isLoading) {
		return <>{bootstrapProps.loading || <div>Loading...</div>}</>;
	}

	if (!data || !params) {
		return <div>No data available</div>;
	}

	return <bootstrapProps.PageComponent params={params} data={data} />;
}
