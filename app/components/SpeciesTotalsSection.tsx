'use client';
import { useState } from 'react';
import { TabNav } from '@/app/components/TabNav';
import { SpeciesTotalsTable } from '@/app/components/SpeciesTotalsTable';
import type { AggregateStatsResult } from '@/app/models/db';

const TABS = [{ id: 'species-totals', label: 'Species totals' }];

export function SpeciesTotalsSection({
	speciesStats
}: {
	speciesStats: AggregateStatsResult[];
}) {
	const [activeTab, setActiveTab] = useState(TABS[0].id);

	return (
		<>
			<TabNav tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
			{activeTab === 'species-totals' && (
				<SpeciesTotalsTable speciesStats={speciesStats} />
			)}
		</>
	);
}
