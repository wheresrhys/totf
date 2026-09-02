import { type SessionWithEncountersCount } from '@/app/models/session';
import { printLocationName } from '@/app/components/shared/DesignSystem';
import { StatOutput } from './shared/StatOutput';
import { NoPrefetchLink } from './shared/NoPrefetchLink';

import type { ViewedGroup } from '@/lib/group-slug';

export function SessionsByDay({
	sessions,
	wrapperClasses = '',
	viewedGroup,
	dateFormat
}: {
	sessions: SessionWithEncountersCount[];
	wrapperClasses?: string;
	viewedGroup: ViewedGroup;
	dateFormat: string;
}) {
	const sessionsByDate: Record<string, SessionWithEncountersCount[]> = {};
	sessions.forEach((session) => {
		sessionsByDate[session.visit_date] = [
			...(sessionsByDate[session.visit_date] || []),
			session
		];
	});
	return (
		<>
			{Object.entries(sessionsByDate).map(([date, daySessions]) => (
				<li className={wrapperClasses} key={date}>
					{daySessions.length === 1 ? (
						<StatOutput
							unit="birds"
							value={daySessions[0].encounters[0].count}
							speciesName={''}
							visitDate={date}
							showUnit={true}
							temporalUnit="day"
							dateFormat={dateFormat}
							viewedGroup={viewedGroup}
						/>
					) : (
						<>
							<StatOutput
								unit="birds"
								value={daySessions.reduce(
									(acc, session) => acc + session.encounters[0].count,
									0
								)}
								speciesName={''}
								visitDate={date}
								showUnit={true}
								temporalUnit="day"
								dateFormat={dateFormat}
								viewedGroup={viewedGroup}
							/>{' '}
							at{' '}
							{daySessions.map((session, index) => (
								<>
									{index > 0 ? ', ' : null}
									<NoPrefetchLink
										className="link"
										href={`/group/${viewedGroup.slug}/session/${session.visit_date}/site/${session.location.id}`}
									>
										{printLocationName(session.location.location_name)}
									</NoPrefetchLink>
								</>
							))}
						</>
					)}
				</li>
			))}
		</>
	);
}
