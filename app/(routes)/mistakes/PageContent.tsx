'use client';
import { useState } from 'react';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { MistakesDiscrepancyTab } from '@/app/components/pages/mistakes/MistakesDiscrepancyTab';
import type { DiscrepenciesResult } from '@/app/models/db';
import { TabNav } from '@/app/components/TabNav';

function formatTabLabel(discrepancyType: string): string {
	const withSpaces = discrepancyType.replace(/_/g, ' ');
	return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

function groupByDiscrepancyType(
	mistakes: DiscrepenciesResult[]
): Record<string, DiscrepenciesResult[]> {
	return mistakes.reduce<Record<string, DiscrepenciesResult[]>>(
		(grouped, mistake) => {
			const type = mistake.discrepency_type;
			if (!grouped[type]) {
				grouped[type] = [];
			}
			grouped[type].push(mistake);
			return grouped;
		},
		{}
	);
}

export function MistakesPageContent({
	data: mistakes
}: {
	data: DiscrepenciesResult[];
}) {
	const grouped = groupByDiscrepancyType(mistakes);
	const discrepancyTypes = Object.keys(grouped);
	const [activeTab, setActiveTab] = useState(discrepancyTypes[0] ?? '');

	return (
		<PageWrapper>
			<PrimaryHeading>Mistakes</PrimaryHeading>
			<TabNav
				tabs={discrepancyTypes.map((type) => ({
					id: type,
					label: formatTabLabel(type)
				}))}
				activeTab={activeTab}
				onTabChange={setActiveTab}
			/>
			{discrepancyTypes.map((type) =>
				type === activeTab ? (
					<MistakesDiscrepancyTab
						key={type}
						discrepancyType={type}
						mistakes={grouped[type]}
					/>
				) : null
			)}
		</PageWrapper>
	);
}
