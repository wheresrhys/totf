import { ruleTypes } from './rule-registry';
import { getRawHighlightsOfTypeAcrossScopes } from './pipeline/fan-out-raw-highlights';
import {
	removeLessSignificantHighlights,
	combineSimilarHighlights
} from './pipeline/combine-highlights';
import { sortHighlights } from './highlight-utils';
import type { HighlightOutlook } from '../types';
import type { StatsTemporalUnit } from '@/app/models/temporal-unit';
import type { ViewedGroup } from '@/app/lib/group-slug';

export async function getCombinedHighlightsOfTypeAcrossScopes(options: {
	timePeriod: string | null;
	temporalUnit: StatsTemporalUnit;
	viewedGroup: ViewedGroup;
	outlook: HighlightOutlook;
	species?: string;
	highlightType: string;
}) {
	const allHighlightsOfType = await getRawHighlightsOfTypeAcrossScopes(options);
	const significantHighlights =
		removeLessSignificantHighlights(allHighlightsOfType);
	const combined = combineSimilarHighlights(
		significantHighlights,
		options.highlightType
	);

	return combined;
}

export async function getAllHighlightsOfOutlookAcrossScopes(options: {
	timePeriod: string | null;
	temporalUnit: StatsTemporalUnit;
	viewedGroup: ViewedGroup;
	outlook: HighlightOutlook;
	species?: string;
}) {
	const allHighlights = await Promise.all(
		ruleTypes.map(async (type) =>
			getCombinedHighlightsOfTypeAcrossScopes({
				highlightType: type,
				...options
			})
		)
	);
	return sortHighlights(allHighlights.flatMap((x) => x));
}

export async function getAllHighlightsAcrossScopes(options: {
	timePeriod: string | null;
	temporalUnit: StatsTemporalUnit;
	viewedGroup: ViewedGroup;
	species?: string;
}) {
	const [inter, intra] = await Promise.all([
		getAllHighlightsOfOutlookAcrossScopes({
			...options,
			outlook: 'inter'
		}),
		getAllHighlightsOfOutlookAcrossScopes({
			...options,
			outlook: 'intra'
		})
	]);
	return {
		inter,
		intra
	};
}
