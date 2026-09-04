'use client';
import { useState } from 'react';
import 'chartkick/chart.js';
import {
	getSpeciesStatsHistory,
	fetchGraphableEncounterData
} from '@/app/actions/sp-data';
import type { AggregateStatsResult } from '@/app/models/db';
import {
	getCounts,
	getYoungsters,
	getSizes
} from '@/app/components/pages/species/StatsHistoryChart';
import { YearComparisonTrendChart } from '@/app/components/YearComparisonTrendChart';
import {
	WingWeightScatterChart,
	type SexedGraphableBird
} from '@/app/components/pages/species/WeightAndWingChart';
import { ChartTile } from '@/app/components/pages/species/ChartTile';

function Spinner() {
	return (
		<div className="flex h-full items-center justify-center">
			<div className="loading loading-spinner loading-xl"></div>
		</div>
	);
}

// The single "Graphs" tab on the species page: a reflowing grid of chart tiles.
// Each tile is text-only until clicked, at which point it expands to render its
// chart and the click triggers the underlying data fetch. Data is memoised at
// this level — the three trend tiles share one `getSpeciesStatsHistory` query and
// the scatter tile has its own `fetchGraphableEncounterData` query, each fired at
// most once regardless of how often its tiles are expanded/collapsed.
export function SpGraphsTab({
	speciesName,
	speciesId,
	viewedGroupId,
	fromDate,
	toDate
}: {
	speciesName: string;
	speciesId: number;
	viewedGroupId: number;
	fromDate?: string;
	toDate?: string;
}) {
	const [expanded, setExpanded] = useState<Set<string>>(new Set());

	const [statsHistory, setStatsHistory] = useState<
		AggregateStatsResult[] | null
	>(null);
	const [statsRequested, setStatsRequested] = useState(false);
	function loadStatsHistory() {
		if (statsRequested) return;
		setStatsRequested(true);
		getSpeciesStatsHistory(speciesName, viewedGroupId, fromDate, toDate).then(
			setStatsHistory
		);
	}

	const [scatterData, setScatterData] = useState<SexedGraphableBird[] | null>(
		null
	);
	const [scatterRequested, setScatterRequested] = useState(false);
	function loadScatterData() {
		if (scatterRequested) return;
		setScatterRequested(true);
		fetchGraphableEncounterData(
			speciesId,
			viewedGroupId,
			fromDate,
			toDate
		).then(setScatterData);
	}

	const charts: {
		id: string;
		heading: string;
		description: string;
		load: () => void;
		renderChart: () => React.ReactNode;
	}[] = [
		{
			id: 'totals',
			heading: 'Totals',
			description: 'Bird and encounter counts over time',
			load: loadStatsHistory,
			renderChart: () =>
				statsHistory ? (
					<YearComparisonTrendChart series={getCounts(statsHistory)} />
				) : (
					<Spinner />
				)
		},
		{
			id: 'young',
			heading: 'Young',
			description: 'juv and postjuv counts plotted over time',
			load: loadStatsHistory,
			renderChart: () =>
				statsHistory ? (
					<YearComparisonTrendChart series={getYoungsters(statsHistory)} />
				) : (
					<Spinner />
				)
		},
		{
			id: 'biometrics',
			heading: 'Biometrics trends',
			description: 'Wing and weight plotted over time',
			load: loadStatsHistory,
			renderChart: () =>
				statsHistory ? (
					<YearComparisonTrendChart series={getSizes(statsHistory)} />
				) : (
					<Spinner />
				)
		},
		{
			id: 'wing-vs-weight',
			heading: 'Wing vs weight',
			description: 'Scatter plot, split by age or sex',
			load: loadScatterData,
			renderChart: () =>
				scatterData ? (
					<WingWeightScatterChart birds={scatterData} />
				) : (
					<Spinner />
				)
		}
	];

	function expand(id: string, load: () => void) {
		load();
		setExpanded((prev) => new Set(prev).add(id));
	}

	function collapse(id: string) {
		setExpanded((prev) => {
			const next = new Set(prev);
			next.delete(id);
			return next;
		});
	}

	return (
		<div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{charts.map((chart) => {
				const isExpanded = expanded.has(chart.id);
				return (
					<ChartTile
						key={chart.id}
						heading={chart.heading}
						description={chart.description}
						expanded={isExpanded}
						onExpand={() => expand(chart.id, chart.load)}
						onCollapse={() => collapse(chart.id)}
					>
						{isExpanded ? chart.renderChart() : null}
					</ChartTile>
				);
			})}
		</div>
	);
}
