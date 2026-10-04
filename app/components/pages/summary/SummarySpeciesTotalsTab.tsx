'use client';

import { SpeciesTotalsTable } from '@/app/components/SpeciesTotalsTable';
import type { TabConfig } from '@/app/components/shared/TabContent';
import type { SummaryTabParams } from './summary-tab-params';
// Id and `dataFetcher` live in the plain (non-`'use client'`) sibling module
// so `summary/**/page.tsx` can read them server-side — see its header comment
// (#1096). This file owns only the presentational half.
import {
	SPECIES_TOTALS_TAB_ID,
	fetchSummarySpeciesTotalsData,
	type SummarySpeciesTotalsData
} from './summary-tab-prefetchers';

export {
	SPECIES_TOTALS_TAB_ID,
	type SummarySpeciesTotalsData
} from './summary-tab-prefetchers';

export const summarySpeciesTotalsTab: TabConfig<
	SummarySpeciesTotalsData,
	SummaryTabParams
> = {
	id: SPECIES_TOTALS_TAB_ID,
	label: 'Species totals',
	dataFetcher: fetchSummarySpeciesTotalsData,
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
