import { noCase } from 'change-case';
import type { HighlightOutlook, HighlightsOfTypeParams } from '../../types';
import { getRule } from '../rule-registry';
import { getPresence, getTimeWindow } from './scope-config';
import { getScopedHighlightsOfType } from './fetch-scoped-stats';
import type { StatsTemporalUnit } from '@/app/models/temporal-unit';
import type { ViewedGroup } from '@/app/lib/group-slug';

export async function getRawHighlightsOfTypeAcrossScopes({
	highlightType,
	timePeriod,
	temporalUnit,
	viewedGroup,
	outlook,
	species
}: {
	highlightType: string;
	timePeriod: string | null;
	temporalUnit: StatsTemporalUnit;
	viewedGroup: ViewedGroup;
	outlook: HighlightOutlook;
	species?: string;
}) {
	const rule = getRule(highlightType);
	const presence = getPresence(rule, temporalUnit, outlook, species);
	if (!presence) return [];

	const configs = presence
		.flatMap(({ sample: sampleTemporalUnit, lakes }) => {
			return Object.entries(lakes).map(([lakeScope, limit]) => {
				if (limit === 0) return;
				const lakeScopeTemporalUnit = noCase(lakeScope) as StatsTemporalUnit;
				return {
					highlightType,
					viewedGroup,
					timePeriod,
					lakeTimeWindow: getTimeWindow(timePeriod, lakeScopeTemporalUnit),
					samplesTimeWindow: getTimeWindow(timePeriod, temporalUnit),
					temporalUnit: sampleTemporalUnit,
					species,
					limit
				};
			});
		})
		.filter((config) => Boolean(config)) as HighlightsOfTypeParams[];

	return (
		await Promise.all(
			configs.map((config) => getScopedHighlightsOfType(config))
		)
	).flatMap((data) => data);
}
