'use client';
import { type SessionWithEncountersCount } from '@/app/models/session';
import { format as formatDate } from 'date-fns';
import { SessionsByDay } from './SessionsByDay';
import type { ViewedGroup } from '@/lib/group-slug';

export function MonthSessionsHeading({
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

export function MonthSessionsContent({
	model: { viewedGroup, monthData: month }
}: {
	model: { viewedGroup: ViewedGroup; monthData: SessionWithEncountersCount[] };
}) {
	return (
		<ol className="list-inside list-none py-3">
			<SessionsByDay
				sessions={month}
				wrapperClasses="mb-2"
				viewedGroup={viewedGroup}
				dateFormat="EEEE do"
			/>
		</ol>
	);
}
