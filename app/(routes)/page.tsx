import {
	StatsAccordion,
	StatConfig,
	type StatsAccordionModel
} from '../components/StatsAccordion';
import { getSeasonMonths, getSeasonName } from '../models/seasons';
import { BootstrapPageData } from '../components/layout/BootstrapPageData';
import { PageWrapper } from '../components/shared/DesignSystem';
import { getTopStats } from '../isomorphic/stats-data-tables';
import { TopMetricsFilterParams } from '../models/db';

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
					unit: 'Birds',
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

async function fetchInitialData(): Promise<StatsAccordionModel[]> {
	const statConfigs = getStatConfigs(new Date());
	return Promise.all(
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
	);
}

function HomePageContent({ data }: { data: StatsAccordionModel[] }) {
	return (
		<PageWrapper>
			<StatsAccordion data={data} />
		</PageWrapper>
	);
}

export default async function Home() {
	return (
		<BootstrapPageData<StatsAccordionModel[]>
			getCacheKeys={() => ['home-stats']}
			dataFetcher={fetchInitialData}
			PageComponent={HomePageContent}
		/>
	);
}
