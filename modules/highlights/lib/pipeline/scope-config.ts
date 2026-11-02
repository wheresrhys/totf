import { camelCase } from 'change-case';
import type {
	YearMonthRestriction,
	HighlightsGenerator,
	HighlightOutlook,
	HighlightPresenceAtScopes,
	HighlightGenerationConfig
} from '../../types';
import { dateToYearMonth } from '../highlight-utils';
import type { StatsTemporalUnit } from '@/app/models/temporal-unit';

export function getPresence(
	rule: HighlightsGenerator,
	temporalUnit: StatsTemporalUnit,
	outlook: HighlightOutlook,
	species?: string
): HighlightGenerationConfig[] | undefined | null {
	if (!rule.presence) return [];
	const rulePresence = species ? rule.presence.species : rule.presence.general;
	return rulePresence?.[
		camelCase(temporalUnit) as keyof HighlightPresenceAtScopes
	]?.[outlook];
}

export function getTimeWindow(
	timePeriod: string | null,
	temporalUnit: StatsTemporalUnit
): YearMonthRestriction | undefined {
	if (!timePeriod) {
		return;
	}
	const { year, month } = dateToYearMonth(timePeriod);

	if (temporalUnit === 'month') {
		return { month, year };
	} else if (temporalUnit === 'year') {
		return { year };
	} else if (temporalUnit === 'all-time') {
		return;
	} else if (temporalUnit === 'month-squashed') {
		return { month };
	}
}
