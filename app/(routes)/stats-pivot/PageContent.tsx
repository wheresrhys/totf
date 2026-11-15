'use client';
import { useState } from 'react';
import { PageWrapper, PrimaryHeading, Standfirst } from '@/modules/ui-kit';
import { MetricSelector } from '@/app/components/pages/stats-pivot/MetricSelector';
import { StatsPivotTable } from '@/app/components/pages/stats-pivot/StatsPivotTable';
import {
	toggleMetricSelection,
	type MetricSelection,
	type PivotMetricColumn
} from '@/app/lib/stats-pivot';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { StatsPivotPageData } from './page';

export function StatsPivotPageContent({
	data
}: {
	params: Record<string, never>;
	data: StatsPivotPageData;
	viewedGroup: ViewedGroup;
}) {
	const [selection, setSelection] = useState<MetricSelection>([]);

	function handleMetricToggle(column: PivotMetricColumn) {
		setSelection((currentSelection) =>
			toggleMetricSelection(currentSelection, column)
		);
	}

	return (
		<PageWrapper>
			<PrimaryHeading>Stats pivot</PrimaryHeading>
			<Standfirst testId="stats-pivot-standfirst">
				Tap a metric to add it to the table, and tap it again to remove it.
			</Standfirst>
			<MetricSelector selection={selection} onToggle={handleMetricToggle} />
			<StatsPivotTable sourceRows={data.sourceRows} selection={selection} />
		</PageWrapper>
	);
}
