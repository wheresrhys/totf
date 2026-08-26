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
// Postjuv/Adult/Unaged) shared across stats tables. `fieldKeys` maps each
// logical field to the caller's actual RowModel key; `labels` supplies the
// header text for each (no defaults — callers word these differently, e.g.
// `Retrap` vs `Retraps`). `hasPullus` omits the Pulli column entirely (rather
// than rendering it empty) and shifts the age-block's left border onto Juv when
// false, per issue #545.
export function buildStandardColumnConfigs<RowModel>(
	hasPullus: boolean,
	fieldKeys: Record<StandardField, keyof RowModel>,
	labels: Record<StandardField, string>
): Partial<Record<keyof RowModel, ColumnConfig>> {
	return {
		[fieldKeys.new]: {
			label: labels.new,
			...columnBlock('bg-green-50')
		},
		[fieldKeys.retraps]: {
			label: labels.retraps,
			...columnBlock('bg-amber-50')
		},
		// Omitted entirely (rather than rendered empty) when no pulli were caught.
		...(hasPullus
			? {
					[fieldKeys.pullus]: {
						label: labels.pullus,
						...columnBlock(`bg-cyan-50 ${ageBlockStartBorder}`)
					}
				}
			: {}),
		[fieldKeys.juvs]: {
			label: labels.juvs,
			// If pulli is hidden, Juv becomes the first column of the age block
			// and inherits its thicker left border.
			...columnBlock(`bg-sky-50 ${hasPullus ? '' : ageBlockStartBorder}`.trim())
		},
		[fieldKeys.postjuv]: {
			label: labels.postjuv,
			...columnBlock('bg-blue-50')
		},
		[fieldKeys.adults]: {
			label: labels.adults,
			...columnBlock('bg-purple-50')
		},
		[fieldKeys.unknownAge]: {
			label: labels.unknownAge,
			...columnBlock(`bg-taupe-50 ${ageBlockEndBorder}`)
		}
	} as Partial<Record<keyof RowModel, ColumnConfig>>;
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
