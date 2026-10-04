'use client';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import type { CoreStatsResult } from '@/app/models/db';
import type { SpeciesTotalsTabParams } from '@/app/actions/sp-data';
import type { ViewedGroup } from '@/app/lib/group-slug';

// Pure presentational `TabConfig.TabComponent` (#1065) — see `SpYearTotalsTab`'s
// comment on `data: unknown` for why the cast below is needed; fetching/
// loading/error state now lives in `TabContent` (#1057), driven by
// `fetchSessionTotalsTabData` (`app/actions/sp-data.ts`) via `TabSet`.
export function SpSessionTotalsTab({
	data,
	viewedGroup
}: {
	params: SpeciesTotalsTabParams;
	data: unknown;
	viewedGroup: ViewedGroup;
}) {
	const sessionTotals = (data as CoreStatsResult[] | null) ?? [];

	return (
		<PeriodTotalsTable
			timeInterval="day"
			rows={sessionTotals}
			firstColumnHeader="Session"
			buildHref={(timePeriod) =>
				`/group/${viewedGroup.slug}/session/${timePeriod}`
			}
			showBusiestSession={false}
		/>
	);
}
