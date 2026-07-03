'use client';
import { type SessionWithEncountersCount } from '@/app/models/session';
import { printLocationName } from '@/app/components/shared/DesignSystem';
import { useState, useEffect } from 'react';
import { StatOutput } from './shared/StatOutput';
import { NoPrefetchLink } from './shared/NoPrefetchLink';
import { YearGroup } from './YearGroup';

function groupByDateMethod(methodName: 'getFullYear' | 'getMonth') {
	return function (
		sessions: SessionWithEncountersCount[] | null
	): SessionWithEncountersCount[][] {
		if (!sessions) return [];
		return Object.entries(
			sessions.reduce(
				(acc: Record<string, SessionWithEncountersCount[]>, session) => {
					const date = new Date(session.visit_date);
					const groupByValue = String(date[methodName]());
					acc[groupByValue] = acc[groupByValue] || [];
					acc[groupByValue].push(session);
					return acc;
				},
				{}
			)
		)
			.map(([groupByValue, sessions]) => ({ groupByValue, sessions }))
			.sort((a, b) => {
				if (a.groupByValue === b.groupByValue) return 0;
				return Number(a.groupByValue) > Number(b.groupByValue) ? -1 : 1;
			})
			.map(({ sessions }) => sessions) as SessionWithEncountersCount[][];
	};
}

const groupByYear = groupByDateMethod('getFullYear');
const groupByMonth = groupByDateMethod('getMonth');

export function SessionsByDay({
	sessions,
	wrapperClasses = '',
	viewedGroupId,
	dateFormat
}: {
	sessions: SessionWithEncountersCount[];
	wrapperClasses?: string;
	viewedGroupId: number;
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
							viewedGroupId={viewedGroupId}
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
								viewedGroupId={viewedGroupId}
							/>{' '}
							at{' '}
							{daySessions.map((session, index) => (
								<>
									{index > 0 ? ', ' : null}
									<NoPrefetchLink
										className="link"
										href={`/group/${viewedGroupId}/session/${session.visit_date}/site/${session.location.id}`}
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

function getYearString(year: SessionWithEncountersCount[][]) {
	return String(new Date(year[0][0].visit_date).getFullYear());
}

export function SessionHistoryCalendar({
	sessions,
	viewedGroupId
}: {
	sessions: SessionWithEncountersCount[] | null;
	viewedGroupId: number;
}) {
	const calendar = groupByYear(sessions || []).map(groupByMonth);
	const thisYearString = getYearString(calendar[0]);
	const [expandedYear, setExpandedYear] = useState<string | false>(
		thisYearString
	);

	useEffect(() => {
		setExpandedYear(thisYearString);
	}, [thisYearString]);

	return (
		<ol>
			{calendar.map((year) => {
				const yearString = getYearString(year);
				return (
					<YearGroup
						key={yearString}
						year={year}
						yearString={yearString}
						viewedGroupId={viewedGroupId}
						expandedYear={expandedYear}
						onToggle={setExpandedYear}
					/>
				);
			})}
		</ol>
	);
}
