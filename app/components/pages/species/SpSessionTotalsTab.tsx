'use client';
import { PeriodTotalsTable } from '@/modules/stats-view';
import { filterEmptySessionRows } from '@/app/lib/month-totals';
import type { SpeciesTotalsTabParams } from '@/app/actions/sp-data';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { StatsCacheBySpeciesResult } from '@/modules/stats/browser';

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
	const sessionTotals = (data as StatsCacheBySpeciesResult[] | null) ?? [];
	// Always hidden, no toggle — per review feedback on #1382, a zero-count
	// session row (`SimpleStatsCacheBySpecies`'s day-grain spine zero-filling a
	// row for every session day the filtered species wasn't encountered) is
	// never worth showing, so there's no "Show" state to offer.
	const visibleRows = filterEmptySessionRows(sessionTotals);

	return (
		<PeriodTotalsTable
			timeInterval="day"
			rows={visibleRows}
			firstColumnHeader="Session"
			buildHref={(timePeriod) =>
				`/group/${viewedGroup.slug}/session/${timePeriod}`
			}
			showBusiestSession={false}
			showBiometricsToggle
		/>
	);
}
