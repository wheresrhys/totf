'use client';
import { useState } from 'react';
import { TabNav } from '@/app/components/TabNav';
import { SpeciesTotalsTable } from '@/app/components/SpeciesTotalsTable';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import type { AggregateStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/lib/group-slug';

const SPECIES_TAB = { id: 'species-totals', label: 'Species totals' };
const SESSION_TOTALS_TAB = { id: 'session-totals', label: 'Session totals' };

export function SpeciesTotalsSection({
	speciesStats,
	sessionTotals,
	viewedGroup
}: {
	speciesStats: AggregateStatsResult[];
	sessionTotals?: AggregateStatsResult[];
	viewedGroup?: ViewedGroup;
}) {
	// "Session totals" leads as the default tab, but only when we have both the
	// per-day rows and a group to build session links for — otherwise the page
	// falls back to "Species totals" as the sole/default tab (its prior
	// behaviour, still used by the all-time and year summary pages).
	const showSessionTotals =
		sessionTotals !== undefined && viewedGroup !== undefined;
	const tabs = showSessionTotals
		? [SESSION_TOTALS_TAB, SPECIES_TAB]
		: [SPECIES_TAB];
	const [activeTab, setActiveTab] = useState(tabs[0].id);

	return (
		<>
			<TabNav tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
			{sessionTotals !== undefined &&
				viewedGroup !== undefined &&
				activeTab === SESSION_TOTALS_TAB.id && (
					<PeriodTotalsTable
						grouping="day"
						rows={sessionTotals}
						firstColumnHeader="Session"
						buildHref={(timePeriod) =>
							`/group/${viewedGroup.slug}/session-temp/${timePeriod}`
						}
					/>
				)}
			{activeTab === SPECIES_TAB.id && (
				<SpeciesTotalsTable speciesStats={speciesStats} />
			)}
		</>
	);
}
