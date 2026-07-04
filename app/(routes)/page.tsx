import {
	StatsAccordion,
	StatConfig,
	type StatsAccordionModel
} from '../components/StatsAccordion';
import { getSeasonMonths, getSeasonName } from '../models/seasons';
import {
	BootstrapPageData,
	type DefaultPageParams
} from '../components/layout/BootstrapPageData';
import {
	BoxyList,
	PageWrapper,
	SecondaryHeading
} from '../components/shared/DesignSystem';
import { getTopStats, type UserTopStatsArgs } from '../actions/top-performers';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { SessionWithEncountersCount } from '../models/session';
import { SessionsByDay } from '../components/SessionHistoryCalendar';
type PageModel = {
	stats: StatsAccordionModel[];
	recentSessions: SessionWithEncountersCount[];
};
function getStatConfigs(
	date: Date
): { heading: string; stats: StatConfig[] }[] {
	return [
		{
			heading: 'Busiest sessions:',
			stats: [
				{
					id: 'busiest-session-all-time',
					category: 'All time',
					unit: 'Birds',
					dataArguments: {
						temporal_unit: 'day',
						metric_name: 'encounters'
					} as UserTopStatsArgs
				},
				{
					id: `busiest-session-${getSeasonName(date)}`,
					category: `Any ${getSeasonName(date)}`,
					unit: 'Birds',
					dataArguments: {
						temporal_unit: 'day',
						metric_name: 'encounters',
						filters: {
							months_filter: getSeasonMonths(date, false) as number[]
						}
					} as UserTopStatsArgs
				},
				{
					id: `busiest-session-this-${getSeasonName(date)}`,
					category: `This ${getSeasonName(date)}`,
					unit: 'Birds',
					dataArguments: {
						temporal_unit: 'day',
						metric_name: 'encounters',
						filters: {
							exact_months_filter: getSeasonMonths(date, true) as string[]
						}
					} as UserTopStatsArgs
				}
			]
		},
		{
			heading: 'Most varied sessions:',
			stats: [
				{
					id: 'most-varied-session-all-time',
					category: 'All time',
					unit: 'Species',
					dataArguments: {
						temporal_unit: 'day',
						metric_name: 'species'
					} as UserTopStatsArgs
				},
				{
					id: `most-varied-session-${getSeasonName(date)}`,
					category: `Any ${getSeasonName(date)}`,
					unit: 'Species',
					dataArguments: {
						temporal_unit: 'day',
						metric_name: 'species',
						filters: {
							months_filter: getSeasonMonths(date, false) as number[]
						}
					} as UserTopStatsArgs
				},
				{
					id: `most-varied-session-this-${getSeasonName(date)}`,
					category: `This ${getSeasonName(date)}`,
					unit: 'Species',
					dataArguments: {
						temporal_unit: 'day',
						metric_name: 'species',
						filters: {
							exact_months_filter: getSeasonMonths(date, true) as string[]
						}
					} as UserTopStatsArgs
				}
			]
		},
		{
			heading: 'Individual species:',
			stats: [
				{
					id: 'highest-species-day-count-ever',
					category: 'Highest day counts',
					unit: 'Birds',
					bySpecies: true,
					dataArguments: {
						temporal_unit: 'day',
						metric_name: 'encounters'
					} as UserTopStatsArgs
				},
				{
					id: 'highest-species-month-count-ever',
					category: 'Highest month counts',
					unit: 'Birds',
					bySpecies: true,
					dataArguments: {
						temporal_unit: 'month',
						metric_name: 'individuals'
					} as UserTopStatsArgs
				},
				{
					id: 'highest-species-year-count-ever',
					category: 'Highest year counts',
					unit: 'Birds',
					bySpecies: true,
					dataArguments: {
						temporal_unit: 'year',
						metric_name: 'individuals'
					} as UserTopStatsArgs
				}
			]
		}
	];
}

export async function fetchRecentSessions(
	viewedGroupId: number
): Promise<SessionWithEncountersCount[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.from('Sessions')
		.select(
			'id, visit_date, location_id, ringing_group_id, location:Locations(location_name), encounters:Encounters(count)'
		)
		.eq('ringing_group_id', viewedGroupId)
		.order('visit_date', { ascending: false })
		.limit(3)
		.then(catchSupabaseErrors) as Promise<SessionWithEncountersCount[]>;
}

export async function fetchHomePageData(
	_: DefaultPageParams,
	viewedGroupId: number
): Promise<PageModel> {
	const statConfigs = getStatConfigs(new Date());
	return {
		stats: await Promise.all(
			statConfigs.map(async (panelGroup) => {
				const panels = await Promise.all(
					panelGroup.stats.map(async (panel) => {
						const data = await getTopStats(Boolean(panel.bySpecies), {
							...panel.dataArguments,
							filters: {
								...(panel.dataArguments.filters ?? {}),
								ringing_group_filter: viewedGroupId
							},
							result_limit: 1
						});

						return {
							definition: panel,
							data: data ?? []
						};
					})
				);
				return {
					heading: panelGroup.heading,
					stats: panels
				};
			})
		),
		recentSessions: await fetchRecentSessions(viewedGroupId)
	};
}

function RecentSessions({
	data,
	viewedGroupId
}: {
	data: SessionWithEncountersCount[];
	viewedGroupId: number;
}) {
	return (
		<div>
			<SecondaryHeading>Recent Sessions</SecondaryHeading>
			<BoxyList>
				<SessionsByDay
					sessions={data}
					viewedGroupId={viewedGroupId}
					dateFormat="EEEE do MMMM"
				/>
			</BoxyList>
		</div>
	);
}
function HomePageContent({
	data,
	viewedGroupId
}: {
	data: PageModel;
	viewedGroupId: number;
}) {
	return (
		<PageWrapper>
			<RecentSessions
				data={data.recentSessions}
				viewedGroupId={viewedGroupId}
			/>
			<StatsAccordion data={data.stats} viewedGroupId={viewedGroupId} />
		</PageWrapper>
	);
}

export default async function Home({
	viewedGroupId
}: {
	viewedGroupId?: number;
} = {}) {
	return (
		<BootstrapPageData<PageModel>
			viewedGroupId={viewedGroupId}
			getCacheKeys={() => ['home-stats']}
			dataFetcher={fetchHomePageData}
			PageComponent={HomePageContent}
		/>
	);
}
