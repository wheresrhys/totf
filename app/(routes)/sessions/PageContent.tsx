'use client';
import type { ViewedGroup } from '@/lib/group-slug';
import type { SessionWithEncountersCount } from '@/app/models/session';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { useState, useEffect } from 'react';
import { YearSessions } from '@/app/components/YearSessions';

function getYearString(year: SessionWithEncountersCount[][]) {
	return String(new Date(year[0][0].visit_date).getFullYear());
}

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

export function SessionsPageContent({
	data,
	viewedGroup
}: {
	data: SessionWithEncountersCount[];
	viewedGroup: ViewedGroup;
}) {
	return (
		<PageWrapper>
			<PrimaryHeading>Session history</PrimaryHeading>
			<SessionHistoryCalendar sessions={data} viewedGroup={viewedGroup} />
		</PageWrapper>
	);
}
