'use client';
import { useState } from 'react';
import 'chartkick/chart.js';
import { type LineChartData } from 'react-chartkick';
import {
	getSpeciesStatsHistory,
	fetchGraphableEncounterData,
	getGroupEffortHistory
} from '@/app/actions/sp-data';
import type { AggregateStatsResult } from '@/app/models/db';
import { BoxyList } from '@/app/components/shared/DesignSystem';
import { getSizes } from '@/app/components/pages/species/StatsHistoryChart';
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

type MeasurementCategoryProps = {
	label: string;
	min: number | null;
	max: number | null;
	avg: number | null;
	median: number | null;
	suffix: string;
};

function MeasurementCategory({
	label,
	min,
	max,
	avg,
	median,
	suffix
}: MeasurementCategoryProps) {
	return (
		<li className="flex items-center gap-2 flex-wrap">
			{label}: {min}-{max}
			{suffix} (avg: {avg}
			{suffix}, median: {median}
			{suffix})
		</li>
	);
}

// The "Biometrics" tab on the species page: the Weight/Wing summary sentences
// (moved out of the intro block, #783) plus the two biometrics-related chart
// tiles (moved out of the "Population" tab — see
// SpPopulationTab.tsx). Fetch state here is independent of SpPopulationTab's: each
// tab fires its own `getSpeciesStatsHistory` call the first time one of its
// own tiles is expanded, even though both tabs' trend charts derive from the
// same underlying query — deduping that is out of scope for #783.
export function SpBiometricsTab({
	speciesStats,
	speciesName,
	speciesId,
	viewedGroupId,
	fromDate,
	toDate
}: {
	speciesStats: AggregateStatsResult;
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

	const [effortHistory, setEffortHistory] = useState<LineChartData | null>(
		null
	);
	const [effortHistoryRequested, setEffortHistoryRequested] = useState(false);
	function loadEffortHistory() {
		if (effortHistoryRequested) return;
		setEffortHistoryRequested(true);
		getGroupEffortHistory(viewedGroupId)
			.then((data) => setEffortHistory({ name: 'effort', data }))
			.catch(() => setEffortHistory(null));
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
			id: 'biometrics',
			heading: 'Biometrics trends',
			description: 'Wing and weight plotted over time',
			load: () => {
				loadStatsHistory();
				loadEffortHistory();
			},
			renderChart: () =>
				statsHistory ? (
					<YearComparisonTrendChart
						series={getSizes(statsHistory)}
						effortHistory={effortHistory ?? undefined}
						compareYearsUrl={
							fromDate !== undefined
								? `/species/${speciesName}?tabId=population`
								: undefined
						}
						yearlyAggregators={{
							'max weight': 'max',
							'median weight': 'mean',
							'min weight': 'min',
							'max wing': 'max',
							'median wing': 'mean',
							'min wing': 'min'
						}}
					/>
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
		<>
			<BoxyList>
				<MeasurementCategory
					label="Weight"
					min={speciesStats.min_weight}
					max={speciesStats.max_weight}
					avg={speciesStats.avg_weight}
					median={speciesStats.median_weight}
					suffix="g"
				/>
				<MeasurementCategory
					label="Wing"
					min={speciesStats.min_wing}
					max={speciesStats.max_wing}
					avg={speciesStats.avg_wing}
					median={speciesStats.median_wing}
					suffix="mm"
				/>
			</BoxyList>
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
		</>
	);
}
