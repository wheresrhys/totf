'use client';

import { SpeciesTotalsTable } from '@/app/components/SpeciesTotalsTable';
import type { TabConfig } from '@/app/components/shared/TabContent';
import {
	SQUASHED_MONTH_SPECIES_TOTALS_TAB_ID,
	type SquashedMonthTabParams
} from './squashed-month-tab-params';

// No `dataFetcher`: the page fetches these rows eagerly and threads them in
// via `TabSet`'s shared params (see `SquashedMonthTabParams`), so `data` is
// always `null` here and the tab renders immediately on first selection.
export const squashedMonthSpeciesTotalsTab: TabConfig<
	unknown,
	SquashedMonthTabParams
> = {
	id: SQUASHED_MONTH_SPECIES_TOTALS_TAB_ID,
	label: 'Species totals',
	TabComponent: ({ params }) => (
		<SpeciesTotalsTable
			speciesStats={params.speciesTotalsForMonth}
			totalsStats={undefined}
			period={{ squashedMonth: params.squashedMonth }}
		/>
	)
};
