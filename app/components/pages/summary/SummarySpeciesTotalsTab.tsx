'use client';

import { SpeciesTotalsTable } from '@/app/components/SpeciesTotalsTable';
import { fetchSpeciesData } from '@/app/actions/spp-data';
import type { SpeciesStatsRow } from '@/app/lib/species-stats';
import type { TabConfig } from '@/app/components/shared/TabContent';
import type { SummaryTabParams } from './summary-tab-params';

export const SPECIES_TOTALS_TAB_ID = 'species-totals';

// Exported so call sites (e.g. `SummaryTotalsSection`'s `initialTabData` spread)
// can cast a server-prefetched `unknown` payload back to this tab's concrete
// `DataType` without reaching for `as unknown as` (#921).
export type SummarySpeciesTotalsData = SpeciesStatsRow[];

export const summarySpeciesTotalsTab: TabConfig<
	SummarySpeciesTotalsData,
	SummaryTabParams
> = {
	id: SPECIES_TOTALS_TAB_ID,
	label: 'Species totals',
	dataFetcher: (params, viewedGroup) =>
		fetchSpeciesData(viewedGroup.id, params.fromDate, params.toDate),
	TabComponent: ({ params, data }) => (
		<SpeciesTotalsTable
			speciesStats={data ?? []}
			totalsStats={undefined}
			period={
				params.year === undefined
					? undefined
					: { year: params.year, month: params.month }
			}
		/>
	)
};
