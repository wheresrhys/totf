import {
	BoxyList,
	PageWrapper,
	SecondaryHeading,
	Table
} from '../components/shared/DesignSystem';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { SessionWithEncountersCount } from '../models/session';
import type { CoreStatsResult, GroupTicksResult } from '../models/db';
import type { SpeciesWithBirdsCount } from '../models/species';
import { SessionsByDay } from '../components/SessionsByDay';
import { SpeciesAlphabetNav } from '../components/SpeciesAlphabetNav';
import { NoPrefetchLink } from '../components/shared/NoPrefetchLink';
import { format as formatDate } from 'date-fns';

export type { SpeciesWithBirdsCount };

export type HomePageSummaryStats = {
	allTime: CoreStatsResult | null;
	thisYear: CoreStatsResult | null;
	lastYear: CoreStatsResult | null;
};

export type PageModel = {
	recentSessions: SessionWithEncountersCount[];
	groupSpecies: SpeciesWithBirdsCount[];
	summaryStats: HomePageSummaryStats | null;
	lastGroupTick: GroupTicksResult | null;
};

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
	field: keyof CoreStatsResult;
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
			<Table testId="summary-stats-table">
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
			<NoPrefetchLink href="/summary" className="link link-secondary text-sm">
				View more stats
			</NoPrefetchLink>
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
export function HomePageContent({
	data,
	viewedGroup
}: {
	data: PageModel;
	viewedGroup: ViewedGroup;
}) {
	return (
		<PageWrapper>
			<SpeciesAlphabetNav species={data.groupSpecies} />
			<SummaryStatsTable data={data.summaryStats} />
			<RecentSessions data={data.recentSessions} viewedGroup={viewedGroup} />
			<LastGroupTick data={data.lastGroupTick} />
		</PageWrapper>
	);
}
