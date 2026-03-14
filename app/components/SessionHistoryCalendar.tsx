'use client';
import { type SessionWithEncountersCount } from '@/app/models/session';
import { AccordionItem } from '@/app/components/shared/Accordion';
import {
	BoxyList,
	SecondaryHeading,
	printLocationName
} from '@/app/components/shared/DesignSystem';
import { useState, useEffect } from 'react';
import { StatOutput } from './shared/StatOutput';
import { format as formatDate } from 'date-fns';
import { NoPrefetchLink } from './shared/NoPrefetchLink';

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
	groupId,
	dateFormat
}: {
	sessions: SessionWithEncountersCount[];
	wrapperClasses?: string;
	groupId: number;
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
							groupId={groupId}
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
								groupId={groupId}
							/>{' '}
							at{' '}
							{daySessions.map((session, index) => (
								<>
									{index > 0 ? ', ' : null}
									<NoPrefetchLink
										className="link"
										href={`/session/group/${groupId}/${session.visit_date}/site/${session.location.id}`}
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

function SessionsOfMonth({
	model: { groupId, monthData: month }
}: {
	model: { groupId: number; monthData: SessionWithEncountersCount[] };
}) {
	return (
		<ol className="list-inside list-none py-3">
			<SessionsByDay
				sessions={month}
				wrapperClasses="mb-2"
				groupId={groupId}
				dateFormat="EEEE do"
			/>
		</ol>
	);
}

function MonthHeading({
	model: { monthData: month }
}: {
	model: { monthData: SessionWithEncountersCount[] };
}) {
	return (
		<span>
			<span className="font-bold">
				{formatDate(new Date(month[0].visit_date), 'MMMM')}:
			</span>{' '}
			{month.length} sessions,{' '}
			{month
				.flatMap((session) => session.encounters)
				.reduce((acc, encounter) => acc + encounter.count, 0)}{' '}
			birds
		</span>
	);
}

function YearHeading({
	model: { yearString }
}: {
	model: { yearString: string };
}) {
	return <SecondaryHeading>{yearString}</SecondaryHeading>;
}

function MonthsOfYear({
	model: { yearData, setExpandedMonth, expandedMonth, groupId }
}: {
	model: {
		yearData: SessionWithEncountersCount[][];
		setExpandedMonth: (month: string | false) => void;
		expandedMonth: string | false;
		groupId: number;
	};
}) {
	return (
		<div data-testid="months-of-year">
			<BoxyList>
				{yearData.map((month) => {
					const id = formatDate(new Date(month[0].visit_date), 'yyyy-MM');
					return (
						<AccordionItem
							key={id}
							id={id}
							HeadingComponent={MonthHeading}
							ContentComponent={SessionsOfMonth}
							model={{ monthData: month, groupId }}
							onToggle={setExpandedMonth}
							expandedId={expandedMonth}
							icon="calendar-week"
						/>
					);
				})}
			</BoxyList>
		</div>
	);
}

function getYearString(year: SessionWithEncountersCount[][]) {
	return String(new Date(year[0][0].visit_date).getFullYear());
}

export function SessionHistoryCalendar({
	sessions,
	groupId
}: {
	sessions: SessionWithEncountersCount[] | null;
	groupId: number;
}) {
	const calendar = groupByYear(sessions || []).map(groupByMonth);
	const [expandedMonth, setExpandedMonth] = useState<string | false>(false);
	const [expandedYear, setExpandedYear] = useState(getYearString(calendar[0]));
	const thisYearString = getYearString(calendar[0]);
	useEffect(() => {
		setExpandedYear(thisYearString);
		setExpandedMonth(false);
	}, [thisYearString]);
	return (
		<ol>
			{calendar.map((year) => {
				const yearString = getYearString(year);
				return (
					<AccordionItem
						key={yearString}
						id={yearString}
						testId="year-accordion-item"
						HeadingComponent={YearHeading}
						ContentComponent={MonthsOfYear}
						model={{
							yearString,
							yearData: year,
							setExpandedMonth,
							expandedMonth,
							groupId
						}}
						onToggle={() => {
							setExpandedYear(yearString);
							setExpandedMonth(false);
						}}
						expandedId={expandedYear}
						icon="calendar"
					/>
				);
			})}
		</ol>
	);
}
