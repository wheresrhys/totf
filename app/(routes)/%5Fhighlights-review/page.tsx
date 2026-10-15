import { notFound } from 'next/navigation';
import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import { canReportHighlights } from '@/app/lib/qa-reporting';
import { fetchYears } from '@/app/lib/fetch-years';
import { ruleTypes } from '@/app/lib/highlights/rules';
import type { TemporalSelection } from '@/app/lib/temporal-filter';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { HighlightsReviewPageContent } from './PageContent';

export type HighlightsReviewSearchParams = {
	year?: string;
	month?: string;
	fromDate?: string;
	toDate?: string;
	temporalUnit?: string;
	highlightType?: string;
};
type PageProps = { searchParams?: Promise<HighlightsReviewSearchParams> };

export type HighlightsReviewParams = {
	selection: TemporalSelection;
	temporalUnit: TemporalUnit;
	highlightType: string;
};
export type HighlightsReviewPageData = { years: number[] };

const TEMPORAL_UNITS: readonly TemporalUnit[] = ['day', 'month', 'year'];

function resolveTemporalUnit(raw: string | undefined): TemporalUnit {
	return (TEMPORAL_UNITS as readonly string[]).includes(raw ?? '')
		? (raw as TemporalUnit)
		: 'month';
}

function resolveHighlightType(raw: string | undefined): string {
	return ruleTypes.includes(raw ?? '') ? (raw as string) : ruleTypes[0];
}

export async function fetchHighlightsReviewPageContent(
	_params: HighlightsReviewParams,
	viewedGroup: ViewedGroup
): Promise<HighlightsReviewPageData> {
	return { years: await fetchYears(viewedGroup) };
}

// Internal debug tool for sanity-checking what the highlights pipeline
// produces across many periods at once (#1133) — gated exactly like the
// existing `/_highlights` admin page (qa cookie + production check); visiting
// that page is this one's activation step too, since the cookie is set with
// `path: '/'`. Own group's data only, resolved from the session cookie by
// `BootstrapPage` (no `groupSlug` route param, same as `species/page.tsx`).
export default async function HighlightsReviewPage(props: PageProps) {
	// if (!(await canReportHighlights())) {
	// 	notFound();
	// }
	return (
		<BootstrapPage<HighlightsReviewPageData, PageProps, HighlightsReviewParams>
			pageProps={props}
			getParams={async (pageProps: PageProps) => {
				const searchParams = (await pageProps.searchParams) ?? {};
				const selection: TemporalSelection = {
					...(searchParams.year ? { year: parseInt(searchParams.year) } : {}),
					...(searchParams.month
						? { month: parseInt(searchParams.month) }
						: {}),
					...(searchParams.fromDate ? { fromDate: searchParams.fromDate } : {}),
					...(searchParams.toDate ? { toDate: searchParams.toDate } : {})
				};
				return {
					selection,
					temporalUnit: resolveTemporalUnit(searchParams.temporalUnit),
					highlightType: resolveHighlightType(searchParams.highlightType)
				};
			}}
			getCacheKeys={() => ['highlights-review']}
			dataFetcher={fetchHighlightsReviewPageContent}
			PageComponent={HighlightsReviewPageContent}
		/>
	);
}
