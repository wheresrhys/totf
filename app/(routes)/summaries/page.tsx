import { format } from 'date-fns';
import {
	BootstrapPageData,
	type DefaultPageParams
} from '@/app/components/layout/BootstrapPageData';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { fetchSessionStats } from '@/lib/underlying-stats';
import {
	buildAvailablePeriodsTree,
	type AvailablePeriod
} from '@/app/models/available-periods';
import type { ViewedGroup } from '@/lib/group-slug';

export type PageData = { periods: AvailablePeriod[] };

export async function fetchAvailablePeriods(
	_params: DefaultPageParams,
	viewedGroupId: number
): Promise<PageData> {
	const { sessionDates } = await fetchSessionStats(viewedGroupId);
	return { periods: buildAvailablePeriodsTree(sessionDates) };
}

function monthLabel(year: string, month: string): string {
	return format(new Date(Number(year), Number(month) - 1, 1), 'LLLL');
}

function StatsNav({ data }: { data: PageData }) {
	return (
		<PageWrapper>
			<PrimaryHeading>Stats</PrimaryHeading>
			<ul>
				<li>
					<NoPrefetchLink className="link" href="/summary">
						All time
					</NoPrefetchLink>
				</li>
				{data.periods.map(({ year, months }) => (
					<li key={year}>
						<NoPrefetchLink className="link" href={`/summary/${year}`}>
							{year}
						</NoPrefetchLink>
						<ul>
							{months.map((month) => (
								<li key={month}>
									<NoPrefetchLink
										className="link"
										href={`/summary/${year}/${month}`}
									>
										{monthLabel(year, month)}
									</NoPrefetchLink>
								</li>
							))}
						</ul>
					</li>
				))}
			</ul>
		</PageWrapper>
	);
}

export default async function StatsPage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPageData<PageData>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['stats']}
			dataFetcher={fetchAvailablePeriods}
			PageComponent={StatsNav}
		/>
	);
}
