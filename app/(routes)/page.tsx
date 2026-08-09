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
import type { AggregateStatsResult, SpeciesRow } from '../models/db';
import { SessionsByDay } from '../components/SessionHistoryCalendar';
import { NoPrefetchLink } from '../components/shared/NoPrefetchLink';

type SpeciesWithBirdsCount = Pick<SpeciesRow, 'id' | 'species_name'> & {
	birds: { count: number }[];
};

export type HomePageSummaryStats = {
	allTime: AggregateStatsResult;
	thisYear: AggregateStatsResult;
};

type PageModel = {
	stats: StatsAccordionModel[];
	recentSessions: SessionWithEncountersCount[];
	topSpecies: SpeciesWithBirdsCount[];
	summaryStats: HomePageSummaryStats | null;
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
	const sessions = (await supabase
		.from('Sessions')
		.select(
			'id, visit_date, location_id, ringing_group_id, location:Locations(location_name), encounters:Encounters(count)'
		)
		.eq('ringing_group_id', viewedGroupId)
		.order('visit_date', { ascending: false })
		.limit(30)
		.then(catchSupabaseErrors)) as SessionWithEncountersCount[];
	const recentDates = [...new Set(sessions.map((s) => s.visit_date))].slice(
		0,
		3
	);
	return sessions.filter((s) => recentDates.includes(s.visit_date));
}

export async function fetchHomePageSummaryStats(
	viewedGroupId: number
): Promise<HomePageSummaryStats | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	const startOfCurrentYear = `${new Date().getFullYear()}-01-01`;
	const [allTime, thisYear] = await Promise.all([
		supabase
			.rpc('aggregate_stats', { ringing_group_filter: viewedGroupId })
			.then(catchSupabaseErrors) as Promise<AggregateStatsResult[] | null>,
		supabase
			.rpc('aggregate_stats', {
				ringing_group_filter: viewedGroupId,
				from_date: startOfCurrentYear
			})
			.then(catchSupabaseErrors) as Promise<AggregateStatsResult[] | null>
	]);
	if (allTime?.[0] == null || thisYear?.[0] == null) {
		return null;
	}
	return { allTime: allTime[0], thisYear: thisYear[0] };
}

export async function fetchTopSpecies(): Promise<SpeciesWithBirdsCount[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	const species = (await supabase
		.from('Species')
		.select('id, species_name, birds:Birds(count)')
		.then(catchSupabaseErrors)) as SpeciesWithBirdsCount[];
	return species
		.filter((s) => (s.birds[0]?.count ?? 0) > 0)
		.sort((a, b) => (b.birds[0]?.count ?? 0) - (a.birds[0]?.count ?? 0))
		.slice(0, 10);
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
		recentSessions: await fetchRecentSessions(viewedGroupId),
		topSpecies: await fetchTopSpecies(),
		summaryStats: await fetchHomePageSummaryStats(viewedGroupId)
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
function SummaryParagraph({
	prefix,
	stats
}: {
	prefix?: string;
	stats: AggregateStatsResult;
}) {
	return (
		<p className="text-lg">
			{prefix}
			<span className="font-bold">{stats.session_count}</span> sessions, with{' '}
			<span className="font-bold">{stats.bird_count}</span> birds of{' '}
			<span className="font-bold">{stats.species_count}</span> species
			encountered <span className="font-bold">{stats.encounter_count}</span>{' '}
			times
		</p>
	);
}
function SummaryStats({ data }: { data: HomePageSummaryStats | null }) {
	if (!data) {
		return null;
	}
	return (
		<div>
			<SummaryParagraph stats={data.allTime} />
			<SummaryParagraph prefix="This year: " stats={data.thisYear} />
		</div>
	);
}
function TopSpecies({ data }: { data: SpeciesWithBirdsCount[] }) {
	return (
		<div>
			<SecondaryHeading>Top species</SecondaryHeading>
			<ul className="flex flex-wrap gap-2">
				{data.map((species) => (
					<li key={species.id}>
						<NoPrefetchLink
							className="link badge badge-outline"
							href={`/species/${species.species_name}`}
						>
							{species.species_name}
						</NoPrefetchLink>
					</li>
				))}
			</ul>
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
			<SummaryStats data={data.summaryStats} />
			<RecentSessions
				data={data.recentSessions}
				viewedGroupId={viewedGroupId}
			/>
			<TopSpecies data={data.topSpecies} />
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
