'use client';
import { type SessionWithEncountersCount } from '@/app/models/session';
import { AccordionItem } from '@/app/components/shared/Accordion';
import {
	BoxyList,
	SecondaryHeading
} from '@/app/components/shared/DesignSystem';
import { useState, useEffect } from 'react';
import { StatOutput } from './shared/StatOutput';
import { format as formatDate } from 'date-fns';

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

function SessionsOfMonth({
	model: month
}: {
	model: SessionWithEncountersCount[];
}) {
	return (
		<ol className="list-inside list-none py-3">
			{month.map((session) => (
				<li className="mb-2" key={session.id}>
					<StatOutput
						unit="birds"
						value={session.encounters[0].count}
						speciesName={''}
						visitDate={session.visit_date}
						showUnit={true}
						temporalUnit="day"
						dateFormat="EEEE do"
					/>
				</li>
			))}
		</ol>
	);
}

function MonthHeading({
	model: month
}: {
	model: SessionWithEncountersCount[];
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
	model: { yearData, setExpandedMonth, expandedMonth }
}: {
	model: {
		yearData: SessionWithEncountersCount[][];
		yearString: string;
		setExpandedMonth: (month: string | false) => void;
		expandedMonth: string | false;
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
							model={month}
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
	sessions
}: {
	sessions: SessionWithEncountersCount[] | null;
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
							expandedMonth
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
