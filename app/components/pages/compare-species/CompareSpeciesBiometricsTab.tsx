'use client';

import { selectComparisonRows } from '@/app/lib/compare-species';
import { type TabConfig } from '@/modules/ui-kit';
import { biometricsComparisonColumns } from './comparison-columns';
import { SpeciesComparisonTable } from './SpeciesComparisonTable';
import {
	BIOMETRICS_DATASET_TAB_ID,
	COMPARISON_TABLE_TEST_ID,
	type CompareSpeciesTabParams
} from './compare-species-tab-params';

/**
 * The species-comparison page's "Biometrics" dataset tab — prop-fed, no
 * `dataFetcher`, for the same reason as its Core stats sibling: the rows both
 * tabs render come from the page's single `fetchSpeciesComparisonStats` call
 * and are threaded through the shared `params`, so `data` is always `null`
 * here. Only `columnConfigs` tells this tab apart from that one (#1412).
 */
export const compareSpeciesBiometricsTab: TabConfig<
	unknown,
	CompareSpeciesTabParams
> = {
	id: BIOMETRICS_DATASET_TAB_ID,
	label: 'Biometrics',
	TabComponent: ({ params }) => (
		<SpeciesComparisonTable
			rows={selectComparisonRows(params.speciesStats, params.selectedSpecies)}
			columnConfigs={biometricsComparisonColumns}
			testId={COMPARISON_TABLE_TEST_ID}
		/>
	)
};
