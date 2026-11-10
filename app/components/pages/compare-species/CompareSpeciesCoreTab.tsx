'use client';

import { selectComparisonRows } from '@/app/lib/compare-species';
import { type TabConfig } from '@/modules/ui-kit';
import { coreStatsComparisonColumns } from './comparison-columns';
import { SpeciesComparisonTable } from './SpeciesComparisonTable';
import {
	COMPARISON_TABLE_TEST_ID,
	CORE_DATASET_TAB_ID,
	type CompareSpeciesTabParams
} from './compare-species-tab-params';

/**
 * The species-comparison page's "Core stats" dataset tab — prop-fed, no
 * `dataFetcher`: its rows arrive already-resolved on the shared `params`
 * (see `CompareSpeciesTabParams`), so `TabContent` renders it straight away
 * with `data: null`, which this tab never reads. It reads the same
 * `params.speciesStats` rows its Biometrics sibling does and differs from it
 * only in `columnConfigs` (#1412).
 *
 * `DataType` is `unknown` rather than `null` purely so the config slots
 * straight into a `TabSet`'s tabs array (`TabSetTabConfig` fixes it at
 * `unknown`) without the cast `SummaryTotalsSection` needs for its own
 * prop-fed tabs — the tab ignores `data` either way.
 */
export const compareSpeciesCoreTab: TabConfig<
	unknown,
	CompareSpeciesTabParams
> = {
	id: CORE_DATASET_TAB_ID,
	label: 'Core stats',
	TabComponent: ({ params }) => (
		<SpeciesComparisonTable
			rows={selectComparisonRows(params.speciesStats, params.selectedSpecies)}
			columnConfigs={coreStatsComparisonColumns}
			testId={COMPARISON_TABLE_TEST_ID}
		/>
	)
};
