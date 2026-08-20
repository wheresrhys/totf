import {
	BootstrapPageData,
	type DefaultPageParams
} from '../components/layout/BootstrapPageData';
import {
	BoxyList,
	PageWrapper,
	SecondaryHeading,
	Table
} from '../components/shared/DesignSystem';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { ViewedGroup } from '@/lib/group-slug';
import type { SessionWithEncountersCount } from '../models/session';
import type {
	AggregateStatsResult,
	SpeciesRow,
	GroupTicksResult
} from '../models/db';
import { SessionsByDay } from '../components/SessionHistoryCalendar';
import { NoPrefetchLink } from '../components/shared/NoPrefetchLink';
import { format as formatDate } from 'date-fns';

type SpeciesWithBirdsCount = Pick<SpeciesRow, 'id' | 'species_name'> & {
	birds: { count: number }[];
};

export type HomePageSummaryStats = {
	allTime: AggregateStatsResult | null;
	thisYear: AggregateStatsResult | null;
	lastYear: AggregateStatsResult | null;
};

type PageModel = {
	recentSessions: SessionWithEncountersCount[];
	topSpecies: SpeciesWithBirdsCount[];
	summaryStats: HomePageSummaryStats | null;
	lastGroupTick: GroupTicksResult | null;
};

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
	const currentYear = new Date().getFullYear();
	const startOfCurrentYear = `${currentYear}-01-01`;
	const startOfLastYear = `${currentYear - 1}-01-01`;
	const endOfLastYear = `${currentYear - 1}-12-31`;
	const [allTime, thisYear, lastYear] = await Promise.all([
		supabase
			.rpc('aggregate_stats', { ringing_group_filter: viewedGroupId })
			.then(catchSupabaseErrors) as Promise<AggregateStatsResult[] | null>,
		supabase
			.rpc('aggregate_stats', {
				ringing_group_filter: viewedGroupId,
				from_date: startOfCurrentYear
			})
			.then(catchSupabaseErrors) as Promise<AggregateStatsResult[] | null>,
		supabase
			.rpc('aggregate_stats', {
				ringing_group_filter: viewedGroupId,
				from_date: startOfLastYear,
				to_date: endOfLastYear
			})
			.then(catchSupabaseErrors) as Promise<AggregateStatsResult[] | null>
	]);
	if (allTime?.[0] == null && thisYear?.[0] == null && lastYear?.[0] == null) {
		return null;
	}
	return {
		allTime: allTime?.[0] ?? null,
		thisYear: thisYear?.[0] ?? null,
		lastYear: lastYear?.[0] ?? null
	};
}

export async function fetchLastGroupTick(
	viewedGroupId: number
): Promise<GroupTicksResult | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	const ticks = (await supabase
		.rpc('group_ticks', {
			ringing_group_filter: viewedGroupId,
			result_limit: 1
		})
		.then(catchSupabaseErrors)) as GroupTicksResult[] | null;
	return ticks?.[0] ?? null;
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
	return {
		recentSessions: await fetchRecentSessions(viewedGroupId),
		topSpecies: await fetchTopSpecies(),
		summaryStats: await fetchHomePageSummaryStats(viewedGroupId),
		lastGroupTick: await fetchLastGroupTick(viewedGroupId)
	};
}

function RecentSessions({
	data,
	viewedGroup
}: {
	data: SessionWithEncountersCount[];
	viewedGroup: ViewedGroup;
}) {
	return (
		<div>
			<SecondaryHeading>
				Sessions{' '}
				<NoPrefetchLink
					href="/sessions"
					className="link link-secondary text-sm"
				>
					View all
				</NoPrefetchLink>
			</SecondaryHeading>
			<BoxyList>
				<SessionsByDay
					sessions={data}
					viewedGroup={viewedGroup}
					dateFormat="EEEE do MMMM"
				/>
			</BoxyList>
		</div>
	);
}
const SUMMARY_STATS_ROWS: {
	label: string;
	field: keyof AggregateStatsResult;
}[] = [
	{ label: 'Sessions', field: 'session_count' },
	{ label: 'Birds', field: 'bird_count' },
	{ label: 'New', field: 'new_bird_count' },
	{ label: 'Encounters', field: 'encounter_count' },
	{ label: 'Species', field: 'species_count' }
];
function getSummaryStatsColumns(): {
	label: string;
	period: keyof HomePageSummaryStats;
}[] {
	const currentYear = new Date().getFullYear();
	return [
		{ label: String(currentYear), period: 'thisYear' },
		{ label: String(currentYear - 1), period: 'lastYear' },
		{ label: 'All time', period: 'allTime' }
	];
}
function SummaryStatsTable({ data }: { data: HomePageSummaryStats | null }) {
	if (!data) {
		return null;
	}
	if (!data.allTime && !data.thisYear && !data.lastYear) {
		return null;
	}
	const columns = getSummaryStatsColumns();
	return (
		<div>
			<Table
				testId="summary-stats-table"
				className="table table-xs sm:table-md"
			>
				<thead>
					<tr>
						<th>Totals</th>
						{columns.map((column) => (
							<th key={column.period} scope="col">
								{column.label}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{SUMMARY_STATS_ROWS.map((row) => (
						<tr key={row.field}>
							<th scope="row">{row.label}</th>
							{columns.map((column) => {
								const stats = data[column.period];
								return (
									<td key={column.period}>{stats ? stats[row.field] : '–'}</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</Table>
		</div>
	);
}
function LastGroupTick({ data }: { data: GroupTicksResult | null }) {
	if (!data) return null;
	return (
		<p className="text-lg mt-3">
			Last tick: {data.species_name} on{' '}
			{formatDate(new Date(data.first_encounter_date), 'do MMMM yyyy')}{' '}
			<NoPrefetchLink href="/ticks" className="link link-secondary text-sm">
				View all ticks
			</NoPrefetchLink>
		</p>
	);
}
function TopSpecies({
	data,
	lastGroupTick
}: {
	data: SpeciesWithBirdsCount[];
	lastGroupTick: GroupTicksResult | null;
}) {
	return (
		<div>
			<SecondaryHeading>
				Species{' '}
				<NoPrefetchLink href="/species" className="link link-secondary text-sm">
					View all
				</NoPrefetchLink>
			</SecondaryHeading>

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
			<LastGroupTick data={lastGroupTick} />
		</div>
	);
}
function HomePageContent({
	data,
	viewedGroup
}: {
	data: PageModel;
	viewedGroup: ViewedGroup;
}) {
	return (
		<PageWrapper>
			<SummaryStatsTable data={data.summaryStats} />
			<RecentSessions data={data.recentSessions} viewedGroup={viewedGroup} />
			<TopSpecies data={data.topSpecies} lastGroupTick={data.lastGroupTick} />
		</PageWrapper>
	);
}

export default async function Home({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPageData<PageModel>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['home-stats']}
			dataFetcher={fetchHomePageData}
			PageComponent={HomePageContent}
		/>
	);
}
