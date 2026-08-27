import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import { type ColumnConfig, type RowModelWithRawData } from './SortableTable';

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
// the `AccordionTableBody`/`SortableTable` `FirstColumnComponent` shape.
export function createNameLinkCell<RawRowData, RowModel>(
	getName: (model: RowModelWithRawData<RawRowData, RowModel>) => string,
	buildHref: (model: RowModelWithRawData<RawRowData, RowModel>) => string
) {
	return function NameLinkCell({
		model
	}: {
		model: RowModelWithRawData<RawRowData, RowModel>;
	}) {
		return (
			<NoPrefetchLink className="link text-wrap" href={buildHref(model)}>
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
export function buildStandardColumnConfigs<RowModel>(
	hasPulli: boolean
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
			...columnBlock('amber')
		},
		// Omitted entirely (rather than rendered empty) when no pulli were caught.
		...(hasPulli
			? {
					pullus: {
						label: 'Pulli',
						...columnBlock('cyan', ageBlockStartBorder)
					}
				}
			: {}),
		juvs: {
			label: 'Juv',
			// If pulli is hidden, Juv becomes the first column of the age block
			// and inherits its thicker left border.
			...columnBlock('sky', hasPulli ? undefined : ageBlockStartBorder)
		},
		postjuv: {
			label: 'Postjuv',
			...columnBlock('blue')
		},
		adults: {
			label: 'Adult',
			...columnBlock('purple')
		},
		unknownAge: {
			label: 'Not aged',
			...columnBlock('taupe', ageBlockEndBorder)
		},
		newYoung: {
			label: 'New young',
			...columnBlock('lime')
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
	const { columnConfigs } = input;
	const orderedProperties = Object.keys(columnConfigs) as (keyof RowModel)[];
	const valueFor = (property: keyof RowModel): React.ReactNode =>
		'totalsRowModel' in input
			? (input.totalsRowModel[property] as React.ReactNode)
			: input.rowModels.reduce(
					(sum, model) => sum + (model[property] as number),
					0
				);
	return orderedProperties.map((property, index) =>
		index === 0 ? (
			<td key={property as string}>Total</td>
		) : (
			<td
				key={property as string}
				className={columnConfigs[property]?.cellClassName}
			>
				{valueFor(property)}
			</td>
		)
	);
}

// A single-entry column config for an opt-in "Sessions" count column. Callers
// that don't want it (e.g. the session page, where the count is trivially 1)
// simply never call this.
export function buildSessionsColumnConfig<RowModel>(
	fieldKey: keyof RowModel,
	label: string
): Partial<Record<keyof RowModel, ColumnConfig>> {
	return {
		[fieldKey]: { label }
	} as Partial<Record<keyof RowModel, ColumnConfig>>;
}
