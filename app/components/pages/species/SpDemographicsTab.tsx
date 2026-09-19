'use client';
import { useRef, useState } from 'react';
import 'chartkick/chart.js';
import { type LineChartData } from 'react-chartkick';
import {
	getSpeciesStatsHistory,
	getSpeciesDemographicsStats,
	getSpeciesArrivalsStats,
	getGroupEffortHistory
} from '@/app/actions/sp-data';
import type {
	CoreStatsResult,
	DemographicsStatsResult,
	ArrivalsStatsResult
} from '@/app/models/db';
import {
	getCounts,
	getReturningVsNew,
	getReturningAges,
	getYoungCounts,
	getNewYoungCounts,
	getArrivals
} from '@/app/components/pages/species/StatsHistoryChart';
import { YearComparisonTrendChart } from '@/app/components/YearComparisonTrendChart';
import { ChartTile } from '@/app/components/pages/species/ChartTile';

// Returning vs new (#854): three plain categorical colours — unlike Young
// counts below, these three series ("New adults", "Returning adults",
// "Young") aren't paired concepts (no combining dark/light shades of a
// shared hue), so a flat array is enough.
export const RETURNING_VS_NEW_COLORS = ['#1f4fb0', '#b83a10', '#0f7a14'];

// Returning ages (#843): '1 year' -> '2 years' -> '3+ years' is an ordered
// progression through a returning bird's proven age, so it gets a dark-to-light
// single-hue ramp (same convention as ARRIVALS_HUES.young below). 'Unknown age
// (new)' is NOT a fourth step of that ramp — those birds aren't actually known to
// be returning at all, just imprecisely coded on a single first encounter — so it
// takes a visually distinct hue instead, signalling "different kind of thing"
// rather than "older still".
export const RETURNING_AGES_HUES = {
	returning: { dark: '#7a0f3d', mid: '#c4487e', light: '#eda3c1' },
	unknown: '#8a7a12'
};
// Series order (matches getReturningAges): 1 year, 2 years, 3+ years, Unknown age (new).
export const RETURNING_AGES_COLORS = [
	RETURNING_AGES_HUES.returning.dark, // 1 year
	RETURNING_AGES_HUES.returning.mid, // 2 years
	RETURNING_AGES_HUES.returning.light, // 3+ years
	RETURNING_AGES_HUES.unknown // Unknown age (new)
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
// Series order (matches getYoungCounts): Juv, Postjuv. Both young-trends
// tiles also plot a Total series (#841, `includeTotalSeries`) appended after
// these two — it intentionally isn't given an explicit colour here, so it
// falls back to the default palette via YearComparisonTrendChart's own
// `colors?.[metricIndex] ?? metricBaseColor(metricIndex)` fallback.
export const YOUNG_COUNTS_COLORS = [
	YOUNG_COUNTS_HUES.juv.dark, // Juv
	YOUNG_COUNTS_HUES.postjuv.dark // Postjuv
];
// Series order (matches getNewYoungCounts): New juv, New postjuv. Same Total
// fallback note as YOUNG_COUNTS_COLORS above.
export const NEW_YOUNG_COUNTS_COLORS = [
	YOUNG_COUNTS_HUES.juv.light, // New juv
	YOUNG_COUNTS_HUES.postjuv.light // New postjuv
];

// Arrivals tile (#860): two colour concepts share one hue map. "New adults"/
// "Returning adults" are a paired dark/light draw off a single hue (the same
// dark-for-new/light-for-returning convention used elsewhere in this file, but
// here as one pair within a single tile rather than split across two hues). "Pulli"
// -> "Juv" -> "Postjuv" is instead an ordered progression through a bird's
// first calendar year, so it gets a 3-tone single-hue ramp (dark to light)
// rather than a two-value pair — the same convention #843's proven-age-bucket
// tile uses for its own ordered '1 year'/'2 years'/'3+ years' series.
export const ARRIVALS_HUES = {
	adult: { dark: '#1f4fb0', light: '#8fb0e8' },
	young: { dark: '#0f7a14', mid: '#4fa854', light: '#8fd08f' }
};
// Keyed by series name (matching getArrivals' `name` fields) rather than a
// positional array: getArrivals omits the "Pulli" series entirely when the
// fetched range has no nonzero pullus count, so a fixed-index array would
// silently misassign every colour after the gap. Looked up per-series in the
// Arrivals tile below instead.
export const ARRIVALS_COLORS_BY_NAME: Record<string, string> = {
	'New adults': ARRIVALS_HUES.adult.dark,
	'Returning adults': ARRIVALS_HUES.adult.light,
	Pulli: ARRIVALS_HUES.young.dark,
	Juv: ARRIVALS_HUES.young.mid,
	Postjuv: ARRIVALS_HUES.young.light
};

function Spinner() {
	return (
		<div className="flex h-full items-center justify-center">
			<div className="loading loading-spinner loading-xl"></div>
		</div>
	);
}

// The "Demographics" tab on the species page (tab id `demographics` — renamed
// from `population` in #878, which also renamed this component
// `SpPopulationTab` -> `SpDemographicsTab`; before that, #801 had renamed the
// tab from `graphs` to `population`, renaming the component `SpGraphsTab` ->
// `SpPopulationTab`, and #783 had relabelled the tab but kept the old id/name
// to minimise blast radius): a reflowing grid of demographics chart tiles.
// Each tile is text-only until clicked, at which point it expands to render
// its chart and the click triggers the underlying data fetch.
//
// Two memoised species-scoped fetches back the tiles, each fired at most once
// regardless of how often tiles expand/collapse: the Counts tile reads
// `core_stats` (`getSpeciesStatsHistory`), while the Returning ages, Young
// counts and New young counts tiles share the companion `demographics_stats`
// fetch (`getSpeciesDemographicsStats`) — #800 split the new-adult/young-trends
// derivations into that separate RPC (originally named `population_stats`,
// renamed `demographics_stats` in #878) rather than folding them into
// `core_stats`; #839 split the original single Young trends tile into
// Young counts / New young counts. The Returning vs new tile (#854) is the
// first to need *both* fetches at once — it remerges `core_stats`' young
// bucket columns with `demographics_stats`' adult columns into a single
// new/returning/young split — so its `renderChart` gates on both being loaded
// rather than just one. A third fetch loads the group-wide effort
// history once (same pattern as SpBiometricsTab) so every tile's chart can offer the
// Normalize toggle.
//
// Every tile also passes `fetchYearSeries` (#852), so its chart's "Interval:
// Year" toggle re-fetches the same two RPCs grouped by year instead of summing
// the monthly points client-side — see the year-fetch refs below for why that
// distinction matters. The biometrics-related tiles (wing/weight trend,
// wing-vs-weight scatter) live on the "Biometrics" tab (SpBiometricsTab.tsx).
export function SpDemographicsTab({
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

	const [statsHistory, setStatsHistory] = useState<CoreStatsResult[] | null>(
		null
	);
	const [statsRequested, setStatsRequested] = useState(false);
	function loadStatsHistory() {
		if (statsRequested) return;
		setStatsRequested(true);
		getSpeciesStatsHistory(speciesName, viewedGroupId, fromDate, toDate).then(
			setStatsHistory
		);
	}

	const [demographicsStats, setDemographicsStats] = useState<
		DemographicsStatsResult[] | null
	>(null);
	const [demographicsRequested, setDemographicsRequested] = useState(false);
	function loadDemographicsStats() {
		if (demographicsRequested) return;
		setDemographicsRequested(true);
		getSpeciesDemographicsStats(
			speciesName,
			viewedGroupId,
			fromDate,
			toDate
		).then(setDemographicsStats);
	}

	// Year-grouped counterparts of the two fetches above, for the charts'
	// "Interval: Year" toggle (#852). These are *not* derivable from the monthly
	// rows: `core_stats`' bird_count and `demographics_stats`' age-bucket
	// counts are per-bird-distinct within each month's cell, so summing months
	// double-counts any bird retrapped in more than one month of a year. Held
	// as lazily-created promises in refs rather than as state, since several
	// tiles ask for the same year data and each `YearComparisonTrendChart`
	// keeps its own copy once resolved — the ref only needs to guarantee one
	// RPC round-trip per interval per tab, not to drive a re-render.
	const yearStatsHistoryPromise = useRef<Promise<CoreStatsResult[]> | null>(
		null
	);
	function fetchYearStatsHistory() {
		yearStatsHistoryPromise.current ??= getSpeciesStatsHistory(
			speciesName,
			viewedGroupId,
			fromDate,
			toDate,
			'year'
		);
		return yearStatsHistoryPromise.current;
	}

	const yearDemographicsStatsPromise = useRef<Promise<
		DemographicsStatsResult[]
	> | null>(null);
	function fetchYearDemographicsStats() {
		yearDemographicsStatsPromise.current ??= getSpeciesDemographicsStats(
			speciesName,
			viewedGroupId,
			fromDate,
			toDate,
			'year'
		);
		return yearDemographicsStatsPromise.current;
	}

	const [arrivalsStats, setArrivalsStats] = useState<
		ArrivalsStatsResult[] | null
	>(null);
	const [arrivalsRequested, setArrivalsRequested] = useState(false);
	function loadArrivalsStats() {
		if (arrivalsRequested) return;
		setArrivalsRequested(true);
		getSpeciesArrivalsStats(speciesName, viewedGroupId, fromDate, toDate).then(
			setArrivalsStats
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

	// A "Compare years" deep link back to this tab is only offered on a year- or
	// month-scoped page (fromDate/toDate present); on the all-time page the chart
	// keeps its inline mode switcher instead. Mirrors SpBiometricsTab.
	const compareYearsUrl =
		fromDate !== undefined
			? `/species/${speciesName}?tabId=demographics`
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
						fetchYearSeries={() => fetchYearStatsHistory().then(getCounts)}
						effortHistory={effortHistory ?? undefined}
						compareYearsUrl={compareYearsUrl}
					/>
				) : (
					<Spinner />
				)
		},
		{
			id: 'returning-vs-new',
			heading: 'Returning vs new',
			description: 'New adults, returning adults and young over time',
			load: () => {
				loadStatsHistory();
				loadDemographicsStats();
				loadEffortHistory();
			},
			renderChart: () =>
				statsHistory && demographicsStats ? (
					<YearComparisonTrendChart
						series={getReturningVsNew(statsHistory, demographicsStats)}
						colors={RETURNING_VS_NEW_COLORS}
						yearlyAggregators={{
							'New adults': 'sum',
							'Returning adults': 'sum',
							Young: 'sum'
						}}
						// The only tile needing both year fetches, mirroring its
						// two-fetch monthly `load` above.
						fetchYearSeries={() =>
							Promise.all([
								fetchYearStatsHistory(),
								fetchYearDemographicsStats()
							]).then(([yearStats, yearDemographics]) =>
								getReturningVsNew(yearStats, yearDemographics)
							)
						}
						effortHistory={effortHistory ?? undefined}
						compareYearsUrl={compareYearsUrl}
					/>
				) : (
					<Spinner />
				)
		},
		{
			id: 'returning-ages',
			heading: 'Returning ages',
			description:
				'Returning adults over time, split by how old they were proven to be',
			load: () => {
				loadDemographicsStats();
				loadEffortHistory();
			},
			renderChart: () =>
				demographicsStats ? (
					<YearComparisonTrendChart
						series={getReturningAges(demographicsStats)}
						colors={RETURNING_AGES_COLORS}
						yearlyAggregators={{
							'1 year': 'sum',
							'2 years': 'sum',
							'3+ years': 'sum',
							'Unknown age (new)': 'sum'
						}}
						fetchYearSeries={() =>
							fetchYearDemographicsStats().then(getReturningAges)
						}
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
				loadDemographicsStats();
				loadEffortHistory();
			},
			renderChart: () =>
				demographicsStats ? (
					<YearComparisonTrendChart
						series={getYoungCounts(demographicsStats)}
						colors={YOUNG_COUNTS_COLORS}
						yearlyAggregators={{
							Juv: 'sum',
							Postjuv: 'sum'
						}}
						fetchYearSeries={() =>
							fetchYearDemographicsStats().then(getYoungCounts)
						}
						effortHistory={effortHistory ?? undefined}
						compareYearsUrl={compareYearsUrl}
						includeTotalSeries
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
				loadDemographicsStats();
				loadEffortHistory();
			},
			renderChart: () =>
				demographicsStats ? (
					<YearComparisonTrendChart
						series={getNewYoungCounts(demographicsStats)}
						colors={NEW_YOUNG_COUNTS_COLORS}
						yearlyAggregators={{
							'New juv': 'sum',
							'New postjuv': 'sum'
						}}
						fetchYearSeries={() =>
							fetchYearDemographicsStats().then(getNewYoungCounts)
						}
						effortHistory={effortHistory ?? undefined}
						compareYearsUrl={compareYearsUrl}
						includeTotalSeries
					/>
				) : (
					<Spinner />
				)
		},
		{
			id: 'arrivals',
			heading: 'Arrivals',
			description:
				'New adults, returning adults, pulli, juv and postjuv arriving each year',
			load: () => {
				loadArrivalsStats();
				loadEffortHistory();
			},
			renderChart: () => {
				if (!arrivalsStats) return <Spinner />;
				const arrivalsSeries = getArrivals(arrivalsStats);
				return (
					<YearComparisonTrendChart
						series={arrivalsSeries}
						colors={arrivalsSeries.map(
							(metric) => ARRIVALS_COLORS_BY_NAME[metric.name]
						)}
						allowYearAccumulation={true}
						yearlyAggregators={{
							'New adults': 'sum',
							'Returning adults': 'sum',
							Pulli: 'sum',
							Juv: 'sum',
							Postjuv: 'sum'
						}}
						effortHistory={effortHistory ?? undefined}
						compareYearsUrl={compareYearsUrl}
					/>
				);
			}
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
