'use client';
import {
	SecondaryHeading,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import {
	fetchNotableRetraps,
	type SpeciesTotalsTabParams
} from '@/app/actions/sp-data';
import { NotableRetrapsTable } from '@/app/components/NotableRetrapsTable';
import type { NotableRetrapsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { TabConfig } from '@/app/components/shared/TabContent';

// Data shape for the species page's Highlights tab (#1066) — the combined
// result of the two previously-separate fetches (`getHighlightsWithinTimeWindow`
// x2 + `fetchNotableRetraps`) this tab's own handrolled `useEffect` made
// before this migration, flattened into a single `dataFetcher`.
export type SpHighlightsTabData = {
	notableRetraps: NotableRetrapsResult[];
};

/**
 * `TabConfig.dataFetcher` for the species page's Highlights tab (#1066).
 * Deliberately **not** exported from `app/actions/sp-data.ts` as a `'use
 * server'` action, even though it lives next to other data-fetching code
 * conceptually — `getHighlightsWithinTimeWindow` is generated client-side on
 * purpose (CLAUDE.md's "Highlights are generated client-side on purpose"),
 * and a `'use server'` function is a Next.js Server Action: calling one from
 * the browser still round-trips to the server, which would quietly undo
 * that. Living here, in this `'use client'` module, keeps it a plain
 * function that genuinely executes in the browser when `TabContent` calls it
 * — the same reason `SummaryHighlightsTab.tsx`'s `fetchSummaryHighlightsData`
 * lives there rather than in `app/actions/summary-stats.ts`.
 *
 * `fetchNotableRetraps` (a real server action) is still called from inside
 * here, same as it was from this tab's own `useEffect` before the migration
 * — only *this* dataFetcher's own highlights-generation half needs to stay
 * client-side, not every call it happens to make.
 */
async function fetchHighlightsTabData(
	params: SpeciesTotalsTabParams,
	viewedGroup: ViewedGroup
): Promise<SpHighlightsTabData> {
	const { speciesName, year, month, fromDate, toDate } = params;
	const [sessionHighlights, monthHighlights, notableRetraps] =
		await Promise.all([
			[],
			[],
			fetchNotableRetraps(speciesName, viewedGroup, fromDate, toDate)
		]);
	return { notableRetraps };
}

// Pure, presentational `TabConfig.TabComponent` (#1066) — fetching/loading/
// error state now lives in `TabContent` (#1057), driven by
// `fetchHighlightsTabData` above. Previously this component handrolled its
// own `useState`/`useEffect` fetch with no `.catch` at all — a rejected
// fetch left `isLoaded` permanently `false` and the spinner never cleared;
// `TabContent`'s real error state fixes that for free.
export function SpHighlightsTab({
	data,
	viewedGroup
}: {
	params: SpeciesTotalsTabParams;
	data: unknown;
	viewedGroup: ViewedGroup;
}) {
	const { notableRetraps } = (data as SpHighlightsTabData | null) ?? {
		notableRetraps: []
	};

	return (
		<>
			<PrimaryHeading>!!! Work in progress !!!</PrimaryHeading>
			{notableRetraps.length > 0 ? (
				<>
					<SecondaryHeading>Notable Retraps</SecondaryHeading>
					<NotableRetrapsTable data={notableRetraps} omitSpeciesName={true} />
				</>
			) : (
				<>
					<SecondaryHeading>Notable Retraps</SecondaryHeading>
					<p>No notable retraps found</p>
				</>
			)}
		</>
	);
}

// The full `TabConfig` for `buildSpeciesTotalsTabs` (`species-tabs.ts`) to
// splice straight in, mirroring `SummaryHighlightsTab.tsx`'s
// `summaryHighlightsTab` — assembled here (not in `species-tabs.ts`) so
// `fetchHighlightsTabData` never has to leave this `'use client'` module.
// `clientSideOnly: true` (per `TabConfig`'s own doc comment and CLAUDE.md's
// highlights note) makes `prefetchActiveTabData` decline to run this
// server-side even for a `?tabId=highlights` deep link — the tab opens
// focused, `TabContent` shows its spinner, and the fetch runs client-side on
// mount instead.
export const spHighlightsTab: TabConfig<
	SpHighlightsTabData,
	SpeciesTotalsTabParams
> = {
	id: 'highlights',
	label: 'Highlights',
	dataFetcher: fetchHighlightsTabData,
	clientSideOnly: true,
	TabComponent: SpHighlightsTab
};
