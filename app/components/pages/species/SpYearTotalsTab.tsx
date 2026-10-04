'use client';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import type { CoreStatsResult } from '@/app/models/db';
import type { SpeciesTotalsTabParams } from '@/app/actions/sp-data';
import type { ViewedGroup } from '@/app/lib/group-slug';

// Pure presentational `TabConfig.TabComponent` (#1065) — fetching/loading/error
// state now lives in `TabContent` (#1057), driven by `fetchYearTotalsTabData`
// (`app/actions/sp-data.ts`) via `TabSet`'s `dataFetcher` wiring.
//
// `data` is typed `unknown` to match `TabConfig<unknown, ParamsType>` — `TabSet`
// forces every tab in its array onto that one `unknown` data type (a per-tab
// `DataType` was requested on #1058's PR review but never implemented) — cast
// back to this tab's real shape immediately.
export function SpYearTotalsTab({
	params,
	data
}: {
	params: SpeciesTotalsTabParams;
	data: unknown;
	viewedGroup: ViewedGroup;
}) {
	const yearTotals = data as CoreStatsResult[] | null;

	return (
		<PeriodTotalsTable
			timeInterval="year"
			rows={yearTotals ?? []}
			firstColumnHeader="Year"
			showSpeciesColumn={false}
			buildHref={(timePeriod) =>
				`/species/${params.speciesName}/${timePeriod.slice(0, 4)}`
			}
		/>
	);
}
