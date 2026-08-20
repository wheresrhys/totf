import {
	StatsAccordion,
	StatConfig,
	type StatsAccordionModel
} from '@/app/components/StatsAccordion';
import { getSeasonMonths, getSeasonName } from '@/app/models/seasons';
import {
	BootstrapPageData,
	type DefaultPageParams
} from '@/app/components/layout/BootstrapPageData';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import {
	getTopStats,
	type UserTopStatsArgs
} from '@/app/actions/top-performers';
import type { ViewedGroup } from '@/lib/group-slug';

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

export async function fetchRecordsData(
	_: DefaultPageParams,
	viewedGroupId: number
): Promise<StatsAccordionModel[]> {
	const statConfigs = getStatConfigs(new Date());
	return Promise.all(
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
	);
}

function RecordsPageContent({
	data,
	viewedGroup
}: {
	data: StatsAccordionModel[];
	viewedGroup: ViewedGroup;
}) {
	return (
		<PageWrapper>
			<PrimaryHeading>Records</PrimaryHeading>
			<StatsAccordion data={data} viewedGroup={viewedGroup} />
		</PageWrapper>
	);
}

export default async function RecordsPage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPageData<StatsAccordionModel[]>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['records']}
			dataFetcher={fetchRecordsData}
			PageComponent={RecordsPageContent}
		/>
	);
}
