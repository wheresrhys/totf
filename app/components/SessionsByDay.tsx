import { type SessionWithEncountersCount } from '@/app/models/session';
import { printLocationName } from '@/app/components/shared/DesignSystem';
import { StatOutput } from './shared/StatOutput';
import { Fragment } from 'react';

import type { ViewedGroup } from '@/app/lib/group-slug';

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
							unit="bird"
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
								unit="bird"
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
							{/* Location names are plain text, not links — the day link above
							    already covers the whole day and there is no location-scoped
							    session route any more (#1020). */}
							{daySessions.map((session, index) => (
								<Fragment key={session.location.id}>
									{index > 0 ? ', ' : null}
									{printLocationName(session.location.location_name)}
								</Fragment>
							))}
						</>
					)}
				</li>
			))}
		</>
	);
}
