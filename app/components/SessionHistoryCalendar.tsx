'use client';
import { type SessionWithEncountersCount } from '@/app/models/session';
import { printLocationName } from '@/app/components/shared/DesignSystem';
import { useState, useEffect } from 'react';
import { StatOutput } from './shared/StatOutput';
import { NoPrefetchLink } from './shared/NoPrefetchLink';
import { YearSessions } from './YearSessions';
import type { ViewedGroup } from '@/lib/group-slug';

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

function getYearString(year: SessionWithEncountersCount[][]) {
	return String(new Date(year[0][0].visit_date).getFullYear());
}

export function SessionHistoryCalendar({
	sessions,
	viewedGroup
}: {
	sessions: SessionWithEncountersCount[] | null;
	viewedGroup: ViewedGroup;
}) {
	const calendar = groupByYear(sessions || []).map(groupByMonth);
	const thisYearString = calendar[0] ? getYearString(calendar[0]) : false;
	const [expandedYear, setExpandedYear] = useState<string | false>(
		thisYearString
	);

	useEffect(() => {
		setExpandedYear(thisYearString);
	}, [thisYearString]);

	if (calendar.length === 0) {
		return <p>No session data available.</p>;
	}

	return (
		<ol>
			{calendar.map((year) => {
				const yearString = getYearString(year);
				return (
					<YearSessions
						key={yearString}
						year={year}
						yearString={yearString}
						viewedGroup={viewedGroup}
						expandedYear={expandedYear}
						onToggle={setExpandedYear}
					/>
				);
			})}
		</ol>
	);
}
