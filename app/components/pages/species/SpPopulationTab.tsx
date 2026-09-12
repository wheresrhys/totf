'use client';
import { useState } from 'react';
import 'chartkick/chart.js';
import { type LineChartData } from 'react-chartkick';
import {
	getSpeciesStatsHistory,
	getSpeciesPopulationStats,
	getGroupEffortHistory
} from '@/app/actions/sp-data';
import type {
	AggregateStatsResult,
	PopulationStatsResult
} from '@/app/models/db';
import {
	getCounts,
	getAgeSplit,
	getYoungCounts,
	getNewYoungCounts
} from '@/app/components/pages/species/StatsHistoryChart';
import { YearComparisonTrendChart } from '@/app/components/YearComparisonTrendChart';
import { ChartTile } from '@/app/components/pages/species/ChartTile';

// Explicit paired colours for the Age split, Young counts and New young counts
// tiles, passed via
// YearComparisonTrendChart's `colors` override prop. The chart's default
// per-metric palette cycles one arbitrary colour per series index with no
// concept of pairing, so a related pair (e.g. "New adults"/"New young", both new
// to the group this year) wouldn't read as related. Each pair is a dark + light
// shade of one base hue.
//
// Age split: two hues — "new" (new to the group this year: New adults, New
// young) and "returning" (First summer, Oldies). Exported (with the hue map) so
// the tab's test can assert the pairing rather than hard-coded indices.
export const AGE_SPLIT_HUES = {
	new: { dark: '#1f4fb0', light: '#8fb0e8' },
	returning: { dark: '#b83a10', light: '#f0a88f' }
};
// Series order (matches getAgeSplit): New adults, First summer, Oldies, New young.
export const AGE_SPLIT_COLORS = [
	AGE_SPLIT_HUES.new.dark, // New adults
	AGE_SPLIT_HUES.returning.dark, // First summer
	AGE_SPLIT_HUES.returning.light, // Oldies
	AGE_SPLIT_HUES.new.light // New young
];

// Young counts / New young counts: two hues (juv, postjuv), split across the
// two tiles by shade instead of by pair within one tile — #839 split the old
// single "Young trends" tile (six series, including two client-side sums) into
// "Young counts" (raw, dark shades) and "New young counts" (first-encounter
// only, light shades), dropping the "young" combined hue since nothing sums
// the two series any more.
export const YOUNG_COUNTS_HUES = {
	juv: { dark: '#0f7a14', light: '#8fd08f' },
	postjuv: { dark: '#7a077a', light: '#d08fd0' }
};
// Series order (matches getYoungCounts): Juv, Postjuv.
export const YOUNG_COUNTS_COLORS = [
	YOUNG_COUNTS_HUES.juv.dark, // Juv
	YOUNG_COUNTS_HUES.postjuv.dark // Postjuv
];
// Series order (matches getNewYoungCounts): New juv, New postjuv.
export const NEW_YOUNG_COUNTS_COLORS = [
	YOUNG_COUNTS_HUES.juv.light, // New juv
	YOUNG_COUNTS_HUES.postjuv.light // New postjuv
];

function Spinner() {
	return (
		<div className="flex h-full items-center justify-center">
			<div className="loading loading-spinner loading-xl"></div>
		</div>
	);
}

// The "Population" tab on the species page (tab id `population` — renamed from
// `graphs` in #801, which also renamed this component `SpGraphsTab` ->
// `SpPopulationTab`; #783 had relabelled the tab but kept the old id/name to
// minimise blast radius): a reflowing grid of population chart tiles. Each tile
// is text-only until clicked, at which point it expands to render its chart and
// the click triggers the underlying data fetch.
//
// Two memoised species-scoped fetches back the tiles, each fired at most once
// regardless of how often tiles expand/collapse: the Counts tile reads
// `aggregate_stats` (`getSpeciesStatsHistory`), while the Age split, Young
// counts and New young counts tiles share the companion `population_stats`
// fetch (`getSpeciesPopulationStats`) — #800 split the age-split/young-trends
// derivations into that separate RPC rather than folding them into
// `aggregate_stats`; #839 split the original single Young trends tile into
// Young counts / New young counts. A third fetch loads the group-wide effort
// history once (same pattern as SpBiometricsTab) so every tile's chart can offer the
// Normalize toggle. The biometrics-related tiles (wing/weight trend,
// wing-vs-weight scatter) live on the "Biometrics" tab (SpBiometricsTab.tsx).
export function SpPopulationTab({
	speciesName,
	viewedGroupId,
	fromDate,
	toDate
}: {
	speciesName: string;
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

	const [populationStats, setPopulationStats] = useState<
		PopulationStatsResult[] | null
	>(null);
	const [populationRequested, setPopulationRequested] = useState(false);
	function loadPopulationStats() {
		if (populationRequested) return;
		setPopulationRequested(true);
		getSpeciesPopulationStats(
			speciesName,
			viewedGroupId,
			fromDate,
			toDate
		).then(setPopulationStats);
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

	// A "Compare years" deep link back to this tab is only offered on a year- or
	// month-scoped page (fromDate/toDate present); on the all-time page the chart
	// keeps its inline mode switcher instead. Mirrors SpBiometricsTab.
	const compareYearsUrl =
		fromDate !== undefined
			? `/species/${speciesName}?tabId=population`
			: undefined;

	const charts: {
		id: string;
		heading: string;
		description: string;
		load: () => void;
		renderChart: () => React.ReactNode;
	}[] = [
		{
			id: 'counts',
			heading: 'Counts',
			description: 'Bird and encounter counts over time',
			load: () => {
				loadStatsHistory();
				loadEffortHistory();
			},
			renderChart: () =>
				statsHistory ? (
					<YearComparisonTrendChart
						series={getCounts(statsHistory)}
						yearlyAggregators={{ encounters: 'sum', birds: 'sum' }}
						effortHistory={effortHistory ?? undefined}
						compareYearsUrl={compareYearsUrl}
					/>
				) : (
					<Spinner />
				)
		},
		{
			id: 'age-split',
			heading: 'Age split',
			description: 'New adults, first summers, oldies and new young over time',
			load: () => {
				loadPopulationStats();
				loadEffortHistory();
			},
			renderChart: () =>
				populationStats ? (
					<YearComparisonTrendChart
						series={getAgeSplit(populationStats)}
						colors={AGE_SPLIT_COLORS}
						yearlyAggregators={{
							'New adults': 'sum',
							'First summer': 'sum',
							Oldies: 'sum',
							'New young': 'sum'
						}}
						effortHistory={effortHistory ?? undefined}
						compareYearsUrl={compareYearsUrl}
					/>
				) : (
					<Spinner />
				)
		},
		{
			id: 'young-counts',
			heading: 'Young counts',
			description: 'Juv and postjuv encounter counts over time',
			load: () => {
				loadPopulationStats();
				loadEffortHistory();
			},
			renderChart: () =>
				populationStats ? (
					<YearComparisonTrendChart
						series={getYoungCounts(populationStats)}
						colors={YOUNG_COUNTS_COLORS}
						yearlyAggregators={{
							Juv: 'sum',
							Postjuv: 'sum'
						}}
						effortHistory={effortHistory ?? undefined}
						compareYearsUrl={compareYearsUrl}
					/>
				) : (
					<Spinner />
				)
		},
		{
			id: 'new-young-counts',
			heading: 'New young counts',
			description:
				'New juv and new postjuv encounter counts over time (first encounters only)',
			load: () => {
				loadPopulationStats();
				loadEffortHistory();
			},
			renderChart: () =>
				populationStats ? (
					<YearComparisonTrendChart
						series={getNewYoungCounts(populationStats)}
						colors={NEW_YOUNG_COUNTS_COLORS}
						yearlyAggregators={{
							'New juv': 'sum',
							'New postjuv': 'sum'
						}}
						effortHistory={effortHistory ?? undefined}
						compareYearsUrl={compareYearsUrl}
					/>
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
