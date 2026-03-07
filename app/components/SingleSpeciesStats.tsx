import { BoxyList } from '@/app/components/shared/DesignSystem';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import type { PageData } from '@/app/(routes)/species/[speciesName]/page';
import { StatOutput } from './shared/StatOutput';
import { UnwrappedBadgeList } from './shared/DesignSystem';
import type { SpeciesStatsRow } from '@/app/models/db';
import type { SpeciesStatConfig } from '@/app/models/species-stats';
import { speciesStatConfigs } from '@/app/models/species-stats';

const categoryOrder: string[] = [];
const statsByCategory: Record<string, SpeciesStatConfig[]> =
	speciesStatConfigs.reduce(
		(map, config) => {
			if (!config.category) return map;
			if (!categoryOrder.includes(config.category)) {
				map[config.category] = [];
				categoryOrder.push(config.category);
			}
			map[config.category].push(config);
			return map;
		},
		{} as Record<string, SpeciesStatConfig[]>
	);

function StatsByCategory({ speciesStats }: { speciesStats: SpeciesStatsRow }) {
	return categoryOrder.map((categoryName) => {
		const subStats = statsByCategory[categoryName];
		return (
			<li className="flex items-center gap-2 flex-wrap" key={categoryName}>
				{categoryName}:{' '}
				<UnwrappedBadgeList
					items={subStats.map(
						(stat) =>
							`${stat.prefix ? `${stat.prefix} ` : ''}${speciesStats[stat.property as keyof SpeciesStatsRow]}${stat.suffix ? ` ${stat.suffix}` : ''}`
					)}
				/>
			</li>
		);
	});
}

export function SingleSpeciesStats({
	topSessions,
	birds,
	speciesStats
}: PageData) {
	if (!speciesStats) return null;
	const mostCaughtBirds =
		speciesStats.max_encountered_bird && speciesStats.max_encountered_bird > 1
			? birds.filter(
					(bird) => bird.encounters.length === speciesStats.max_encountered_bird
				)
			: [];
	const oldestBirds =
		speciesStats.max_proven_age && speciesStats.max_proven_age > 1
			? birds.filter((bird) => bird.provenAge === speciesStats.max_proven_age)
			: [];

	return (
		<BoxyList testId="headline-stats">
			<StatsByCategory speciesStats={speciesStats} />
			{oldestBirds.length ? (
				<li className="flex items-center gap-2 flex-wrap">
					<span className="text-nowrap">
						Oldest birds: {speciesStats.max_proven_age} years old:
					</span>
					{oldestBirds.map((bird) => (
						<NoPrefetchLink
							key={bird.ring_no}
							className="badge badge-outline link"
							href={`/bird/${bird.ring_no}`}
						>
							{bird.ring_no}
						</NoPrefetchLink>
					))}
				</li>
			) : (
				<li>No notably old birds</li>
			)}
			{/* todo: longest gap between first and last caught */}
			{mostCaughtBirds.length > 0 ? (
				<li className="flex items-center gap-2 flex-wrap">
					<span className="text-nowrap">
						Most caught bird{mostCaughtBirds.length > 1 ? 's' : ''}:{' '}
						{speciesStats.max_encountered_bird} encounters each
					</span>
					{mostCaughtBirds.map((bird) => (
						<NoPrefetchLink
							key={bird.ring_no}
							className="badge badge-outline link"
							href={`/bird/${bird.ring_no}`}
						>
							{bird.ring_no}
						</NoPrefetchLink>
					))}
				</li>
			) : (
				<li>No birds retrapped</li>
			)}
			<li className="flex items-center gap-2 flex-wrap">
				<span className="text-nowrap">Top sessions:</span>{' '}
				{topSessions.map((session) => (
					<StatOutput
						key={session.visit_date}
						value={session.metric_value}
						visitDate={session.visit_date}
						temporalUnit="day"
						classes="badge badge-outline"
						dateFormat="d MMM yyyy"
					/>
				))}
			</li>
		</BoxyList>
	);
}
