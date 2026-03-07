'use client';
import { useState, useEffect } from 'react';
import { AccordionItem } from './shared/Accordion';
import { SecondaryHeading, BoxyList } from './shared/DesignSystem';
import { StatOutput } from './shared/StatOutput';
import type { TopPeriodsResult, TopSpeciesResult } from '@/app/models/db';
import {
	getTopStats,
	type TopStatsArgsWithoutLimit
} from '@/app/actions/stats-data-tables';
import type { TemporalUnit } from './shared/StatOutput';

export type StatConfig = {
	id: string;
	category: string;
	unit: string;
	bySpecies?: boolean;
	dataArguments: TopStatsArgsWithoutLimit;
};

export type AccordionItemModel = {
	definition: StatConfig;
	data: TopPeriodsResult[] | TopSpeciesResult[];
};

export type StatsAccordionModel = {
	heading: string;
	stats: AccordionItemModel[];
};

function hasData(data: TopPeriodsResult[] | null): data is TopPeriodsResult[] {
	return data !== null;
}

function ContentComponent({
	model,
	expandedId
}: {
	model: AccordionItemModel;
	expandedId: string | false;
}) {
	const [data, setData] = useState<TopPeriodsResult[] | null>(model.data);
	const [isLoading, setLoading] = useState(false);
	const [isLoaded, setLoaded] = useState(false);

	useEffect(() => {
		if (expandedId === model.definition.id) {
			let cancelSetLoading = false;
			if (!isLoaded) {
				// avoid the annoying microsecond flash of a spinner
				setTimeout(() => {
					if (!cancelSetLoading) {
						setLoading(true);
					}
				}, 100);
				getTopStats(Boolean(model.definition.bySpecies), {
					...model.definition.dataArguments,
					result_limit: 5
				})
					.then((data) => {
						setData(data);
					})
					.catch((error) => {
						console.error(error);
					})
					.finally(() => {
						setLoaded(true);
						cancelSetLoading = true;
						setLoading(false);
					});
			}
		}
	}, [
		expandedId,
		isLoaded,
		isLoading,
		model.definition.id,
		model.definition.bySpecies,
		model.definition.dataArguments
	]);

	return hasData(data) ? (
		<ol className="list-inside list-none py-3">
			{data.map((item) => (
				<li
					className="mb-2"
					key={`${item.visit_date}-${(item as TopSpeciesResult).species_name} ?? ''`}
				>
					<StatOutput
						value={item.metric_value}
						speciesName={(item as TopSpeciesResult).species_name}
						visitDate={item.visit_date}
						showUnit={true}
						unit={model.definition.unit}
						temporalUnit={
							model.definition.dataArguments.temporal_unit as TemporalUnit
						}
					/>
				</li>
			))}
			{isLoading && (
				<span className="loading loading-spinner loading-xl"></span>
			)}
		</ol>
	) : (
		<span>No data available</span>
	);
}
function HeadingComponent({ model }: { model: AccordionItemModel }) {
	return (
		<span>
			<span className="font-bold">{model.definition.category}:</span>{' '}
			<span>
				{model.data[0].metric_value} {model.definition.unit}
			</span>
		</span>
	);
}

export function StatsAccordion({ data }: { data: StatsAccordionModel[] }) {
	const [expanded, setExpanded] = useState<string | false>(false);
	useEffect(() => {
		setExpanded(false);
	}, []);
	return (
		<>
			{data.map(({ heading, stats }) => (
				<div data-testid="stats-accordion-group" key={heading}>
					<SecondaryHeading>{heading}</SecondaryHeading>
					<BoxyList>
						{stats.map((item) => (
							<AccordionItem
								key={item.definition.id}
								id={item.definition.id}
								HeadingComponent={HeadingComponent}
								ContentComponent={ContentComponent}
								model={item}
								onToggle={setExpanded}
								expandedId={expanded}
							/>
						))}
					</BoxyList>
				</div>
			))}
		</>
	);
}
