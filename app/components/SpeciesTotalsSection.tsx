'use client';
import { useState } from 'react';
import { TabNav } from '@/app/components/TabNav';
import { SpeciesTotalsTable } from '@/app/components/SpeciesTotalsTable';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import type { AggregateStatsResult } from '@/app/models/db';

const SPECIES_TOTALS_TAB = { id: 'species-totals', label: 'Species totals' };
const YEAR_TOTALS_TAB = { id: 'year-totals', label: 'Year totals' };

export function SpeciesTotalsSection({
	speciesStats,
	yearlyTotals
}: {
	speciesStats: AggregateStatsResult[];
	// Only the all-time summary page fetches this — undefined (not just an
	// empty array) means "this page doesn't have a Year totals tab at all",
	// so /summary/{year} and /summary/{year}/{month} (which don't pass it)
	// keep Species totals as their sole/default tab, matching pre-#571
	// behaviour, until tickets 572/573 add their own analogous tabs here.
	yearlyTotals?: AggregateStatsResult[];
}) {
	const tabs =
		yearlyTotals !== undefined
			? [YEAR_TOTALS_TAB, SPECIES_TOTALS_TAB]
			: [SPECIES_TOTALS_TAB];
	const [activeTab, setActiveTab] = useState(tabs[0].id);

	return (
		<>
			<TabNav tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
			{activeTab === 'year-totals' && (
				<PeriodTotalsTable
					grouping="year"
					rows={yearlyTotals ?? []}
					firstColumnHeader="Year"
					buildHref={(timePeriod) =>
						`/summary/${new Date(timePeriod).getFullYear()}`
					}
				/>
			)}
			{activeTab === 'species-totals' && (
				<SpeciesTotalsTable speciesStats={speciesStats} />
			)}
		</>
	);
}
