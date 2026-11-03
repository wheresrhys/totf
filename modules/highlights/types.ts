import type {
	SimpleStatsCacheBySpeciesRow,
	SimpleStatsCacheRow
} from '@/app/models/db';
import type { TemporalUnit, CamelCaseStatsTemporalUnit } from '@/app/models/temporal-unit';
import type { StatUnit } from '@/modules/ui-kit';
import type { ViewedGroup } from '@/app/lib/group-slug';
export type { StatUnit } from '@/modules/ui-kit';

export type YearMonthRestriction = {
	year?: number;
	month?: number;
};
export type HighlightCategory =
	| 'rarity'
	| 'count'
	| 'biometrics'
	| 'demographics';

export interface NumericHighlightValue {
	timePeriod: string;
	value: number;
}

export interface TextHighlightValue {
	timePeriod: string;
	value: string;
}

export function isNumericHighlightValue(
	highlight: HighlightValue
): highlight is HighlightValue & NumericHighlightValue {
	return typeof highlight.value === 'number';
}
export type HighlightValue = {
	timePeriod: string;
	value: number | string;
	species: string | null;
};

export type SpeciesUnitMode = 'replace' | 'prefix' | undefined;

export type HighlightDescriptor = {
	category: HighlightCategory;
	type: string;
	unit: StatUnit;
	speciesUnitMode?: SpeciesUnitMode;
	smallestWins?: boolean;
};

export type HighlightScope = {
	temporalUnit: TemporalUnit;
	parentTimeWindow?: YearMonthRestriction;
	species?: string;
};

export type HighlightRanking = {
	position: number;
	isTied: boolean;
};

export type HighlightValueWithRanking = HighlightValue & {
	ranking: HighlightRanking;
};

export type NewHighlightValue = HighlightValueWithRanking & {
	descriptor: HighlightDescriptor;
	scope: HighlightScope;
};

export type CombinedHighlight = {
	formatters: HighlightFormatters;
	descriptor: HighlightDescriptor;
	value: HighlightValue;
	species: string | undefined;
	bestPosition: number;
	scopes: {
		scope: HighlightScope;
		ranking: HighlightRanking;
	}[];
};

export type CombinedHighlightPrinter = (
	combinedHighlight: CombinedHighlight
) => string;

type HighlightFormatters = {
	combinedHighlightPrinter: CombinedHighlightPrinter;
};

// Which row shape a rule's `generator` reads — see modules/highlights/CLAUDE.md for the field's history.
export type HighlightsGenerator = {
	formatters: HighlightFormatters;
	descriptor: HighlightDescriptor;
	limit?: number;
	speciesUsed: 'none' | 'present' | 'grouped';
	presence?: HighlightPresenceConfig;
	generator: (
		stats: (SimpleStatsCacheBySpeciesRow | SimpleStatsCacheRow)[],
		scope?: HighlightScope
	) => HighlightValue[];
	condition?: (scope: HighlightScope) => boolean;
};

type HighlightPositionsLimit = 0 | 1 | 2 | 3;

export type HighlightDataLake = {
	allTime?: HighlightPositionsLimit;
	year?: HighlightPositionsLimit;
	monthSquashed?: HighlightPositionsLimit;
	month?: HighlightPositionsLimit;
};

export type HighlightOutlook = 'inter' | 'intra';
export type HighlightGenerationConfig = {
	sample: CamelCaseStatsTemporalUnit;
	lakes: HighlightDataLake;
};

export type ScopeHighlightConfig = {
	intra?: HighlightGenerationConfig[];
	inter?: HighlightGenerationConfig[];
};

export type HighlightPresenceAtScopes = Record<CamelCaseStatsTemporalUnit, ScopeHighlightConfig | null >

type HighlightPresenceConfig = {
	species: HighlightPresenceAtScopes | null;
	general: HighlightPresenceAtScopes | null;
};

/**
 * One fully-resolved request for highlights of a single type at a single
 * scope. `lib/pipeline/fan-out-raw-highlights.ts` constructs these from a
 * rule's presence config; `lib/pipeline/fetch-scoped-stats.ts` consumes them.
 */
export type BaseHighlightsOfTypeParams = {
	highlightType: string;
	timePeriod: string;
	temporalUnit: TemporalUnit;
	viewedGroup: ViewedGroup;
	species?: string;
};

export type HighlightsOfTypeParams = BaseHighlightsOfTypeParams & {
	lakeTimeWindow?: YearMonthRestriction;
	samplesTimeWindow?: YearMonthRestriction;
	limit: number;
};
