import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import { type ColumnConfig, type RowModelWithRawData } from './SortableTable';

// A thicker border marks where the "age class" block of columns
// (Pulli/Juv/Postjuv/Adult/Unaged) starts and ends, visually separating it
// from the plain count columns either side.
export const ageBlockStartBorder = 'border-l-4 border-l-base-content/30';
export const ageBlockEndBorder = 'border-r-4 border-r-base-content/30';

// Shorthand for column configs that tint both the header and every data
// cell in that column the same colour, so column groupings read clearly
// top-to-bottom.
export function columnBlock(
	className: string
): Pick<ColumnConfig, 'headerClassName' | 'cellClassName'> {
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

// The logical fields the column-config builder knows about: the capture-type
// fields (New/Retrap) plus the age-class fields (Pulli/Juv/Postjuv/Adult/
// Unaged) — independent of any caller's RowModel key names or header wording.
export type StandardField =
	| 'new'
	| 'retraps'
	| 'pullus'
	| 'juvs'
	| 'postjuv'
	| 'adults'
	| 'unknownAge';

// Builds the colour-blocked standard column configs (New/Retrap/Pulli/Juv/
// Postjuv/Adult/Unaged) shared across stats tables. Keyed directly by
// `StandardField`, so a caller's RowModel must use those field names for its
// own new/retraps/pullus/juvs/postjuv/adults/unknownAge counts; `labels`
// supplies the header text for each (no defaults — callers word these
// differently, e.g. `Retrap` vs `Retraps`). `hasPullus` omits the Pulli column
// entirely (rather than rendering it empty) and shifts the age-block's left
// border onto Juv when false, per issue #545.
export function buildStandardColumnConfigs<RowModel>(
	hasPullus: boolean,
	labels: Record<StandardField & keyof RowModel, string>
): Partial<Record<keyof RowModel, ColumnConfig>> {
	// `RowModel` is generic here, so TS can't confirm each `StandardField` is
	// actually a key of it inside the function body (only the caller's
	// concrete instantiation proves that) — read through a `StandardField`-keyed
	// view of the same object, matching the cast already needed on the return.
	const fieldLabels = labels as Record<StandardField, string>;
	return {
		new: {
			label: fieldLabels.new,
			...columnBlock('bg-green-50')
		},
		retraps: {
			label: fieldLabels.retraps,
			...columnBlock('bg-amber-50')
		},
		// Omitted entirely (rather than rendered empty) when no pulli were caught.
		...(hasPullus
			? {
					pullus: {
						label: fieldLabels.pullus,
						...columnBlock(`bg-cyan-50 ${ageBlockStartBorder}`)
					}
				}
			: {}),
		juvs: {
			label: fieldLabels.juvs,
			// If pulli is hidden, Juv becomes the first column of the age block
			// and inherits its thicker left border.
			...columnBlock(`bg-sky-50 ${hasPullus ? '' : ageBlockStartBorder}`.trim())
		},
		postjuv: {
			label: fieldLabels.postjuv,
			...columnBlock('bg-blue-50')
		},
		adults: {
			label: fieldLabels.adults,
			...columnBlock('bg-purple-50')
		},
		unknownAge: {
			label: fieldLabels.unknownAge,
			...columnBlock(`bg-taupe-50 ${ageBlockEndBorder}`)
		}
	} as Partial<Record<keyof RowModel, ColumnConfig>>;
}

// Builds the ordered `<td>` cells for a pinned totals row, mirroring the
// `orderedColumnProperties` iteration duplicated in `SpeciesTotalsTableBody`/
// `PeriodTotalsTableBody`: the first column renders `firstColumnLabel` as plain
// text (not a link, since a totals row has nothing to link to), and every other
// column renders its value straight from `totalsRowModel`, carrying the same
// `cellClassName` column-block styling the data rows use so the columns stay
// visually aligned top-to-bottom. Returns a bare `<td>` array (no wrapping
// `<tr>`) so `SortableTable` owns the row element and its testid/styling.
export function buildTotalsRowCells<RowModel>(
	columnConfigs: Partial<Record<keyof RowModel, ColumnConfig>>,
	totalsRowModel: RowModel,
	firstColumnLabel: string
): React.ReactNode[] {
	const orderedProperties = Object.keys(columnConfigs) as (keyof RowModel)[];
	return orderedProperties.map((property, index) =>
		index === 0 ? (
			<td key={property as string}>{firstColumnLabel}</td>
		) : (
			<td
				key={property as string}
				className={columnConfigs[property]?.cellClassName}
			>
				{totalsRowModel[property] as React.ReactNode}
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
