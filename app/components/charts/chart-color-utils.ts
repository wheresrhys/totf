// Colour-ramp logic shared by `YearComparisonTrendChart`'s three modes: the
// per-metric base palette, the hex-lightening primitive, and the per-series
// colour arrays each mode hands to chartkick. No knowledge of series shape —
// `chart-series-transforms.ts` owns that half.

// Base colour per metric, matching chartkick's own default palette so the
// per-metric year-on-year / this-year charts reuse the exact colour each metric
// has in the all-time chart. The all-time chart is handed these same colours
// explicitly (rather than relying on chartkick's implicit defaults) so the two
// views stay in lock-step even if chartkick's palette ever changes.
const METRIC_BASE_COLORS = [
	'#3366CC',
	'#DC3912',
	'#FF9900',
	'#109618',
	'#990099',
	'#3B3EAC',
	'#0099C6',
	'#DD4477',
	'#66AA00',
	'#B82E2E',
	'#316395',
	'#994499',
	'#22AA99',
	'#AAAA11',
	'#6633CC',
	'#E67300',
	'#8B0707',
	'#329262',
	'#5574A6',
	'#651067'
];

// The current calendar year is always drawn in black so it stands out against
// the shaded previous years.
const CURRENT_YEAR_COLOR = '#000000';

export function metricBaseColor(metricIndex: number): string {
	return METRIC_BASE_COLORS[metricIndex % METRIC_BASE_COLORS.length];
}

// Mixes a hex colour towards white by `fraction` (0 = unchanged, 1 = white).
function lighten(hex: string, fraction: number): string {
	const value = parseInt(hex.slice(1), 16);
	const r = (value >> 16) & 0xff;
	const g = (value >> 8) & 0xff;
	const b = value & 0xff;
	const mix = (channel: number) =>
		Math.round(channel + (255 - channel) * fraction);
	const toHex = (channel: number) => channel.toString(16).padStart(2, '0');
	return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

// The "this-year" view's min/max band (see `toThisYearSeries`) is drawn from
// two series named 'Previous max'/'Previous min' purely to shade the band
// between them — they aren't meaningful legend entries on their own (the band
// they draw is already implied by the shaded area, and the median/current-year
// lines are the series worth labelling). These names never occur in the
// all-time or compare-years series, so filtering them out of the legend here
// is safe across every mode without needing a per-mode library override.
const HIDDEN_LEGEND_SERIES_NAMES = new Set(['Previous max', 'Previous min']);

export function isHiddenFromLegend(seriesName: string): boolean {
	return HIDDEN_LEGEND_SERIES_NAMES.has(seriesName);
}

// One colour per year (in the oldest-first order `toYearOnYearSeries` returns),
// for the compare-years view. The current year is black; every previous year is
// a shade of the metric's base colour — the most recent previous year at full
// strength, older years progressively paler.
export function yearColors(
	years: number[],
	baseColor: string,
	currentYear: number
): string[] {
	const previousYears = years.filter((year) => year !== currentYear);
	const denominator = previousYears.length - 1;
	const MAX_LIGHTEN = 0.7;
	return years.map((year) => {
		if (year === currentYear) return CURRENT_YEAR_COLOR;
		// `previousYears` is oldest-first: rank 0 is the oldest (palest), the last
		// rank is the most recent previous year (full-strength base colour).
		const rank = previousYears.indexOf(year);
		const lightenFraction =
			denominator <= 0 ? 0 : MAX_LIGHTEN * (1 - rank / denominator);
		return lighten(baseColor, lightenFraction);
	});
}

// Colours for the this-year view, in the series order `toThisYearSeries`
// returns (max, min, median, current year): a pale band, a mid-shade median,
// and the metric's full-strength base colour for the current year.
export function thisYearColors(baseColor: string): string[] {
	const bandColor = lighten(baseColor, 0.75);
	const medianColor = lighten(baseColor, 0.35);
	return [bandColor, bandColor, medianColor, baseColor];
}
