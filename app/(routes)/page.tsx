import {
	StatsAccordion,
	StatConfig,
	type StatsAccordionModel
} from '../components/StatsAccordion';
import { getSeasonMonths, getSeasonName } from '../models/seasons';
import { BootstrapPageData } from '../components/layout/BootstrapPageData';
import {
	BoxyList,
	PageWrapper,
	SecondaryHeading
} from '../components/shared/DesignSystem';
import { getTopStats } from '../isomorphic/stats-data-tables';
import { supabase, catchSupabaseErrors } from '@/lib/supabase';
import { TopMetricsFilterParams } from '../models/db';
import type { SessionWithEncountersCount } from '../models/session';
import { StatOutput } from '../components/shared/StatOutput';

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
					dataArguments: { temporal_unit: 'day', metric_name: 'encounters' }
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
						} as TopMetricsFilterParams
					}
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
						} as TopMetricsFilterParams
					}
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
					dataArguments: { temporal_unit: 'day', metric_name: 'species' }
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
						} as TopMetricsFilterParams
					}
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
						} as TopMetricsFilterParams
					}
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
					}
				},
				{
					id: 'highest-species-month-count-ever',
					category: 'Highest month counts',
					unit: 'Birds',
					bySpecies: true,
					dataArguments: {
						temporal_unit: 'month',
						metric_name: 'individuals'
					}
				},
				{
					id: 'highest-species-year-count-ever',
					category: 'Highest year counts',
					unit: 'Birds',
					bySpecies: true,
					dataArguments: {
						temporal_unit: 'year',
						metric_name: 'individuals'
					}
				}
			]
		}
	];
}

async function fetchRecentSessions(): Promise<SessionWithEncountersCount[]> {
	return supabase
		.from('Sessions')
		.select('visit_date, encounters:Encounters(count)')
		.order('visit_date', { ascending: false })
		.limit(3)
		.then(catchSupabaseErrors) as Promise<SessionWithEncountersCount[]>;
}

async function fetchInitialData(): Promise<PageModel> {
	const statConfigs = getStatConfigs(new Date());
	return {
		stats: await Promise.all(
			statConfigs.map(async (panelGroup) => {
				const panels = await Promise.all(
					panelGroup.stats.map(async (panel) => {
						const data = await getTopStats(Boolean(panel.bySpecies), {
							...panel.dataArguments,
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
		recentSessions: await fetchRecentSessions()
	};
}

function RecentSessions({ data }: { data: SessionWithEncountersCount[] }) {
	return (
		<div>
			<SecondaryHeading>Recent Sessions</SecondaryHeading>
			<BoxyList>
				{data.map((session) => (
					<li key={session.id}>
						<StatOutput
							unit="birds"
							value={session.encounters[0].count}
							speciesName={''}
							visitDate={session.visit_date}
							showUnit={true}
							temporalUnit="day"
							dateFormat="EEEE do MMMM"
						/>
						{/* <Link href={`/session/${session.id}`}>{session.visit_date}</Link> */}
					</li>
				))}
			</BoxyList>
		</div>
	);
}
function HomePageContent({ data }: { data: PageModel }) {
	console.log('asdasd', data);
	return (
		<PageWrapper>
			<RecentSessions data={data.recentSessions} />
			<StatsAccordion data={data.stats} />
		</PageWrapper>
	);
}

export default async function Home() {
	return (
		<BootstrapPageData<PageModel>
			getCacheKeys={() => ['home-stats']}
			dataFetcher={fetchInitialData}
			PageComponent={HomePageContent}
		/>
	);
}
