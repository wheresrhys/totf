'use client';
import { useState } from 'react';
import { TabNav } from '@/app/components/TabNav';
import { SpeciesTotalsTable } from '@/app/components/SpeciesTotalsTable';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import type { AggregateStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/lib/group-slug';

const SPECIES_TOTALS_TAB = { id: 'species-totals', label: 'Species totals' };
const YEAR_TOTALS_TAB = { id: 'year-totals', label: 'Year totals' };
const SESSION_TOTALS_TAB = { id: 'session-totals', label: 'Session totals' };

export function SpeciesTotalsSection({
	speciesStats,
	yearlyTotals,
	sessionTotals,
	viewedGroup
}: {
	speciesStats: AggregateStatsResult[];
	// The all-time summary page passes this — undefined (not just an empty
	// array) means "this page has no Year totals tab", so pages that don't pass
	// it keep Species totals as their sole/default tab.
	yearlyTotals?: AggregateStatsResult[];
	// The month summary page passes these — a leading "Session totals" tab needs
	// both the per-day rows and a group to build session links for. undefined
	// means "this page has no Session totals tab".
	sessionTotals?: AggregateStatsResult[];
	viewedGroup?: ViewedGroup;
}) {
	// Each summary page leads with at most one period tab before "Species
	// totals": the all-time page with "Year totals", the month page with
	// "Session totals". The year/day pages pass neither and keep Species totals
	// as their sole/default tab.
	const showSessionTotals =
		sessionTotals !== undefined && viewedGroup !== undefined;
	const tabs =
		yearlyTotals !== undefined
			? [YEAR_TOTALS_TAB, SPECIES_TOTALS_TAB]
			: showSessionTotals
				? [SESSION_TOTALS_TAB, SPECIES_TOTALS_TAB]
				: [SPECIES_TOTALS_TAB];
	const [activeTab, setActiveTab] = useState(tabs[0].id);

	return (
		<>
			<TabNav tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
			{yearlyTotals !== undefined && activeTab === YEAR_TOTALS_TAB.id && (
				<PeriodTotalsTable
					grouping="year"
					rows={yearlyTotals}
					firstColumnHeader="Year"
					buildHref={(timePeriod) =>
						`/summary/${new Date(timePeriod).getFullYear()}`
					}
				/>
			)}
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
			{activeTab === SPECIES_TOTALS_TAB.id && (
				<SpeciesTotalsTable speciesStats={speciesStats} />
			)}
		</>
	);
}
