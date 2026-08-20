'use client';
import { useState, useEffect } from 'react';
import { SecondaryHeading, BoxyList } from './shared/DesignSystem';
import type { TopPeriodsResult, TopSpeciesResult } from '@/app/models/db';
import type { UserTopStatsArgs } from '@/app/actions/top-performers';
import type { ViewedGroup } from '@/lib/group-slug';
import { StatsAccordionItem } from './StatsAccordionItem';

export type StatConfig = {
	id: string;
	category: string;
	unit: string;
	bySpecies?: boolean;
	dataArguments: UserTopStatsArgs;
};

export type AccordionItemModel = {
	definition: StatConfig;
	data: TopPeriodsResult[] | TopSpeciesResult[];
};

export type StatsAccordionModel = {
	heading: string;
	stats: AccordionItemModel[];
};

export function StatsAccordion({
	data,
	viewedGroup
}: {
	data: StatsAccordionModel[];
	viewedGroup: ViewedGroup;
}) {
	const [expanded, setExpanded] = useState<string | false>(false);
	useEffect(() => {
		setExpanded(false);
	}, [viewedGroup.id]);
	return (
		<>
			{data.map(({ heading, stats }) => (
				<div data-testid="stats-accordion-group" key={heading}>
					<SecondaryHeading>{heading}</SecondaryHeading>
					<BoxyList>
						{stats.map((item) => (
							<StatsAccordionItem
								key={`${viewedGroup.id}-${item.definition.id}`}
								item={item}
								viewedGroup={viewedGroup}
								expanded={expanded}
								onToggle={setExpanded}
							/>
						))}
					</BoxyList>
				</div>
			))}
		</>
	);
}
