import { GroupTicksResult } from '@/app/models/db';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { ViewedGroup } from '@/app/lib/group-slug';
import {
	buildTemporalQueryStrings,
	parseTemporalSelection,
	type TemporalSearchParams,
	type TemporalSelection
} from '@/app/lib/temporal-filter';
import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import { TicksPageContent } from './PageContent';

type PageProps = { searchParams?: Promise<TemporalSearchParams> };

export type TicksPageParams = { selection: TemporalSelection };

export type TicksPageData = {
	ticks: GroupTicksResult[];
	// The year of the group's first-ever encounter, or null with no data at all.
	firstYear: number | null;
};

function isTemporalSelectionEmpty(selection: TemporalSelection): boolean {
	return Object.keys(buildTemporalQueryStrings(selection)).length === 0;
}

async function fetchGroupTicks(
	viewedGroup: ViewedGroup,
	selection: TemporalSelection
): Promise<GroupTicksResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('group_ticks', {
			ringing_group_filter: viewedGroup.id,
			temporal_filter_mode: 'scope',
			from_date: selection.fromDate,
			to_date: selection.toDate,
			year_filter: selection.year,
			month_filter: selection.month
		})
		.then(catchSupabaseErrors) as Promise<GroupTicksResult[]>;
}

// The group's all-time ticks are ordered latest-first, so the last one is the
// group's first-ever encounter. A filtered page fetches them alongside its own
// period's ticks purely to learn that year.
function getFirstYear(allTimeTicks: GroupTicksResult[]): number | null {
	const earliestTick = allTimeTicks.at(-1);
	return earliestTick
		? parseInt(earliestTick.first_encounter_date.slice(0, 4))
		: null;
}

export async function fetchTicksPageContent(
	{ selection }: TicksPageParams,
	viewedGroup: ViewedGroup
): Promise<TicksPageData> {
	if (isTemporalSelectionEmpty(selection)) {
		const ticks = await fetchGroupTicks(viewedGroup, selection);
		return { ticks, firstYear: getFirstYear(ticks) };
	}
	const [ticks, allTimeTicks] = await Promise.all([
		fetchGroupTicks(viewedGroup, selection),
		fetchGroupTicks(viewedGroup, {})
	]);
	return { ticks, firstYear: getFirstYear(allTimeTicks) };
}

export default async function TicksPage(
	props: PageProps & { viewedGroup?: ViewedGroup } = {}
) {
	return (
		<BootstrapPage<TicksPageData, PageProps, TicksPageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getParams={async (pageProps: PageProps) => ({
				selection: parseTemporalSelection((await pageProps.searchParams) ?? {})
			})}
			getCacheKeys={({ selection }) => [
				'ticks',
				new URLSearchParams(buildTemporalQueryStrings(selection)).toString()
			]}
			dataFetcher={fetchTicksPageContent}
			PageComponent={TicksPageContent}
		/>
	);
}
