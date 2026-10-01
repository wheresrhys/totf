import { type SessionWithEncountersCount } from '@/app/models/session';
import { StatOutput } from './shared/StatOutput';

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
					/>
				</li>
			))}
		</>
	);
}
