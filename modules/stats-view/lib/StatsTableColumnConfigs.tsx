import {
	NoPrefetchLink,
	type ColumnConfig,
	type RowModelWithRawData
} from '@/modules/ui-kit';
import { BiometricStatNames, type BiometricStatName } from '@/modules/stats/browser';

// A thicker border marks where the "age class" block of columns
// (Pulli/Juv/Postjuv/Adult/Unaged) starts and ends, visually separating it
// from the plain count columns either side.
export const ageBlockStartBorder = 'border-l-4 border-l-base-content/30';
export const ageBlockEndBorder = 'border-r-4 border-r-base-content/30';

// Shorthand for column configs that tint both the header and every data
// cell in that column the same colour, so column groupings read clearly
// top-to-bottom. Callers pass just the base Tailwind colour name (e.g.
// `'green'`) - this applies the light-mode `-50` tint and, per issue #605,
// the equivalent dark-mode `-950` tint, so callers never hand-wire the
// per-mode shade themselves. `extraClassName` carries anything unrelated to
// the tint itself (e.g. the age-block borders below). New base colours must
// be added to the `@source inline(...)` safelist in `app/globals.css`, since
// Tailwind's file scanner can't see class names composed at runtime.
export function columnBlock(
	baseColor: string,
	extraClassName?: string
): Pick<ColumnConfig, 'headerClassName' | 'cellClassName'> {
	const className =
		`bg-${baseColor}-50 dark:bg-${baseColor}-950 ${extraClassName ?? ''}`.trim();
	return { headerClassName: className, cellClassName: className };
}

// Factory for a first-column cell that renders a row's name as a link. Both the
// display name and the href are derived per row from caller-supplied getters,
// so the same primitive serves a species table (`/species/{name}`), a
// period-totals table (`/summary/{year}`), etc. The returned component matches
// the `AccordionTableBody`/`SortableTable` `FirstColumnComponent` shape. When
// `buildHref` yields a falsy value (empty string), the name renders as plain
// text instead of a link — for rows with no single drill-down target, e.g. the
// all-time "Month totals" tab whose combine-years rows span every year at once.
export function createNameLinkCell<RawRowData, RowModel>(
	getName: (model: RowModelWithRawData<RawRowData, RowModel>) => string,
	buildHref: (
		model: RowModelWithRawData<RawRowData, RowModel>
	) => string | undefined
) {
	return function NameLinkCell({
		model
	}: {
		model: RowModelWithRawData<RawRowData, RowModel>;
	}) {
		const href = buildHref(model);
		if (!href) {
			return <span className="text-wrap">{getName(model)}</span>;
		}
		return (
			<NoPrefetchLink className="link text-wrap" href={href}>
				{getName(model)}
			</NoPrefetchLink>
		);
	};
}

// Builds the colour-blocked standard column configs (New/Retrap/Pulli/Juv/
// Postjuv/Adult/Unaged) shared across stats tables. Keyed directly by
// `StandardField`, so a caller's RowModel must use those field names for its
// own new/retraps/pullus/juvs/postjuv/adults/unknownAge counts; `labels`
// supplies the header text for each (no defaults — callers word these
// differently, e.g. `Retrap` vs `Retraps`). `hasPulli` omits the Pulli column
// entirely (rather than rendering it empty) and shifts the age-block's left
// border onto Juv when false, per issue #545.

const ENCOUNTERS_AGE_TOOLTIP =
	'Birds caught more than once may contribute to the total of multiple age columns';

export function buildStandardColumnConfigs<RowModel>(
	hasPulli: boolean,
	showAggregationTooltips: boolean = false,
	aggregateBy?: string
): Partial<Record<keyof RowModel, ColumnConfig>> {
	// `RowModel` is generic here, so TS can't confirm each `StandardField` is
	// actually a key of it inside the function body (only the caller's
	// concrete instantiation proves that) — read through a `StandardField`-keyed
	// view of the same object, matching the cast already needed on the return.
	return {
		new: {
			label: 'New',
			...columnBlock('green')
		},
		retraps: {
			label: 'Retrap',
			...columnBlock('amber'),
			tooltip: showAggregationTooltips
				? aggregateBy === 'bird'
					? 'Excludes retraps of new birds'
					: 'Includes retraps of new birds'
				: null
		},
		// Omitted entirely (rather than rendered empty) when no pulli were caught.
		...(hasPulli
			? {
					pullus: {
						label: 'Pulli',
						...columnBlock('cyan', ageBlockStartBorder),
						tooltip: showAggregationTooltips
							? aggregateBy === 'bird'
								? ''
								: ENCOUNTERS_AGE_TOOLTIP
							: null
					}
				}
			: {}),
		juvs: {
			label: 'Juv',
			// If pulli is hidden, Juv becomes the first column of the age block
			// and inherits its thicker left border.
			...columnBlock('sky', hasPulli ? undefined : ageBlockStartBorder),
			tooltip: showAggregationTooltips
				? aggregateBy === 'bird'
					? 'Excludes birds already caught as pulli'
					: ENCOUNTERS_AGE_TOOLTIP
				: null
		},
		postjuv: {
			label: 'Postjuv',
			...columnBlock('blue'),
			tooltip: showAggregationTooltips
				? aggregateBy === 'bird'
					? 'Excludes birds already caught as pulli or juv'
					: ENCOUNTERS_AGE_TOOLTIP
				: null
		},
		adults: {
			label: 'Adult',
			...columnBlock('purple'),
			tooltip: showAggregationTooltips
				? aggregateBy === 'bird'
					? ''
					: ENCOUNTERS_AGE_TOOLTIP
				: null
		},
		unknownAge: {
			label: 'Not aged',
			...columnBlock('taupe', ageBlockEndBorder),
			tooltip: showAggregationTooltips
				? aggregateBy === 'bird'
					? 'Includes birds recorded with inconsistent ages'
					: ENCOUNTERS_AGE_TOOLTIP
				: null
		}
	} as Partial<Record<keyof RowModel, ColumnConfig>>;
}

// Input for `buildTotalsRowCells`: always the `columnConfigs` that fix the
// column order/styling, plus exactly one source for the totals values —
// either a pre-computed `totalsRowModel`, or the table's own `rowModels`,
// which the function then sums per column itself. The discriminated union
// makes those two sources mutually exclusive at the type level.
export type TotalsRowCellsInput<RowModel> = {
	columnConfigs: Partial<Record<keyof RowModel, ColumnConfig>>;
	// Optional per-column overrides rendered verbatim in place of the summed/
	// passed-through value — e.g. a `'-'` placeholder for the Individuals column
	// on an encounters-only tab, where a bird count is meaningless.
	cellOverrides?: Partial<Record<keyof RowModel, React.ReactNode>>;
} & ({ totalsRowModel: RowModel } | { rowModels: RowModel[] });

// Builds the ordered `<td>` cells for a pinned totals row, mirroring the
// `orderedColumnProperties` iteration duplicated in `SpeciesTotalsTableBody`/
// `PeriodTotalsTableBody`: the first column renders the plain-text label
// `'Total'` (not a link, since a totals row has nothing to link to), and every
// other column renders its total value — taken straight from `totalsRowModel`
// when supplied, or summed across the given `rowModels` otherwise — carrying
// the same `cellClassName` column-block styling the data rows use so the
// columns stay visually aligned top-to-bottom. Returns a bare `<td>` array (no
// wrapping `<tr>`) so `SortableTable` owns the row element and its
// testid/styling.
export function buildTotalsRowCells<RowModel>(
	input: TotalsRowCellsInput<RowModel>
): React.ReactNode[] {
	const { columnConfigs, cellOverrides } = input;
	const orderedProperties = Object.keys(columnConfigs) as (keyof RowModel)[];
	const valueFor = (property: keyof RowModel): React.ReactNode => {
		if (cellOverrides && cellOverrides[property] !== undefined) {
			return cellOverrides[property];
		}
		return 'totalsRowModel' in input
			? (input.totalsRowModel[property] as React.ReactNode)
			: input.rowModels.reduce(
					(sum, model) => sum + (model[property] as number),
					0
				);
	};
	return orderedProperties.map((property, index) =>
		index === 0 ? (
			<td key={property as string}>Total</td>
		) : (
			<td
				key={property as string}
				className={columnConfigs[property]?.cellClassName}
			>
				{columnConfigs[property]?.formatter
					? columnConfigs[property].formatter(valueFor(property))
					: valueFor(property)}
			</td>
		)
	);
}

// Em dash placeholder for a biometric cell with no value — a species/period
// with no biometric-eligible encounters, or any non-numeric input. Mirrors
// `app/components/pages/compare-species/comparison-columns.ts`'s
// `MISSING_VALUE` convention exactly, so the two tables read the same way.
const MISSING_BIOMETRIC_VALUE = '—';

// Formats a biometric cell value to 1 decimal place, matching
// `comparison-columns.ts`'s `formatMeasurement` exactly (including its
// round-trip through `Number()`, which drops a trailing ".0"). Anything that
// isn't a `number` (including `null`, the genuine "no biometric-eligible
// encounters" case) renders as an em dash.
function formatBiometricValue(value: unknown): string {
	return typeof value === 'number'
		? String(Number(value.toFixed(1)))
		: MISSING_BIOMETRIC_VALUE;
}

// `max`/`avg`/`min`/`median` phrasing, keyed off the first segment of each
// `BiometricStatName` (e.g. `max_weight` -> `max`).
const BIOMETRIC_STAT_PREFIX_LABELS: Record<string, string> = {
	max: 'Max',
	avg: 'Avg',
	min: 'Min',
	median: 'Median'
};

// Unit suffix for each measurement, keyed off the second segment of each
// `BiometricStatName` (e.g. `max_weight` -> `weight`).
const BIOMETRIC_MEASUREMENT_UNITS: Record<string, string> = {
	weight: 'g',
	wing: 'mm'
};

// Builds the 8 wing/weight biometric column configs (#1433) — the shared
// foundation the Counts/Biometrics toggle switches a stats table's
// per-species breakdown block onto, mirroring `buildStandardColumnConfigs`'s
// shape for the existing age-bucket block. Reduces over the canonical
// `BiometricStatNames` array (`@/modules/stats/browser`) rather than a
// hand-typed key list, so the config's key set can never drift from it.
// Label/formatting copies `comparison-columns.ts`'s `biometricsComparisonColumns`/
// `formatMeasurement` convention exactly, for consistency between the two
// tables that now render the same 8 columns.
export function buildBiometricColumnConfigs(): Partial<
	Record<BiometricStatName, ColumnConfig>
> {
	return BiometricStatNames.reduce<Partial<Record<BiometricStatName, ColumnConfig>>>(
		(configs, statName) => {
			const [prefix, measurement] = statName.split('_');
			configs[statName] = {
				label: `${BIOMETRIC_STAT_PREFIX_LABELS[prefix]} ${measurement} (${BIOMETRIC_MEASUREMENT_UNITS[measurement]})`,
				formatter: formatBiometricValue
			};
			return configs;
		},
		{}
	);
}
