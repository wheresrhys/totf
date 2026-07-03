'use client';
import { useState, useEffect } from 'react';
import { type SessionWithEncountersCount } from '@/app/models/session';
import { AccordionItem } from '@/app/components/shared/Accordion';
import {
	BoxyList,
	SecondaryHeading
} from '@/app/components/shared/DesignSystem';
import { format as formatDate } from 'date-fns';
import { MonthSessionsHeading, MonthSessionsContent } from './MonthSessions';

function YearHeading({
	model: { yearString }
}: {
	model: { yearString: string };
}) {
	return <SecondaryHeading>{yearString}</SecondaryHeading>;
}

function YearContent({
	model: { yearData, expandedMonth, setExpandedMonth, viewedGroupId }
}: {
	model: {
		yearData: SessionWithEncountersCount[][];
		expandedMonth: string | false;
		setExpandedMonth: (month: string | false) => void;
		viewedGroupId: number;
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
							HeadingComponent={MonthSessionsHeading}
							ContentComponent={MonthSessionsContent}
							model={{ monthData: month, viewedGroupId }}
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

export function YearSessions({
	year,
	yearString,
	viewedGroupId,
	expandedYear,
	onToggle
}: {
	year: SessionWithEncountersCount[][];
	yearString: string;
	viewedGroupId: number;
	expandedYear: string | false;
	onToggle: (id: string | false) => void;
}) {
	const [expandedMonth, setExpandedMonth] = useState<string | false>(false);

	useEffect(() => {
		if (expandedYear !== yearString) {
			setExpandedMonth(false);
		}
	}, [expandedYear, yearString]);

	return (
		<AccordionItem
			id={yearString}
			testId="year-accordion-item"
			HeadingComponent={YearHeading}
			ContentComponent={YearContent}
			model={{
				yearString,
				yearData: year,
				expandedMonth,
				setExpandedMonth,
				viewedGroupId
			}}
			onToggle={onToggle}
			expandedId={expandedYear}
			icon="calendar"
		/>
	);
}
