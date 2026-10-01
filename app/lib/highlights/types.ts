import type { BiometricsStatsResult, CoreStatsResult } from '@/app/models/db';
import type {
	TemporalUnit,
	StatUnit
} from '@/app/components/shared/StatOutput';
export type {
	TemporalUnit,
	StatUnit
} from '@/app/components/shared/StatOutput';
import type { StatsRepository } from '@/app/actions/stats-cache';

export type EnhancedStatsRepository = StatsRepository & {
	coreStatsBySpecies: Record<string, CoreStatsResult[]>;
	biometricsStatsBySpecies: Record<string, BiometricsStatsResult[]>;
};

export interface TimePeriodedItem {
	time_period: string | null;
}
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
	descriptor: HighlightDescriptor;
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

export type HighlightsOfType = {
	formatters: HighlightFormatters;
	descriptor: HighlightDescriptor;
	scope: HighlightScope;
	values: HighlightValue[];
};

export type HighlightRanking = {
	highlightIndex: number;
	siblingHighlights: HighlightValue[];
	position: number;
	isTied: boolean;
};

export type CherryPickedHighlight = {
	formatters: HighlightFormatters;
	descriptor: HighlightDescriptor;
	scope: HighlightScope;
	value: HighlightValue;
	ranking: HighlightRanking;
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

export type HighlightListPrefixPrinter = (
	highlightsOfType: HighlightsOfType
) => string;

type HighlightFormatters = {
	combinedHighlightPrinter: CombinedHighlightPrinter;
	highlightListPrefixPrinter: HighlightListPrefixPrinter;
};

type StatsRowOf<StatsProperty> =
	StatsProperty extends Record<string, (infer Row)[]>
		? Row
		: StatsProperty extends (infer Row)[]
			? Row
			: never;

type HighlightsGeneratorFor<
	StatsSelectorKey extends keyof EnhancedStatsRepository
> = {
	formatters: HighlightFormatters;
	descriptor: HighlightDescriptor;
	limit?: number;
	statsSelector: StatsSelectorKey;
	generator: (
		stats: StatsRowOf<EnhancedStatsRepository[StatsSelectorKey]>[],
		scope?: HighlightScope
	) => Omit<HighlightValue, 'descriptor'>[];
	condition?: (scope: HighlightScope) => boolean;
};

export type HighlightsGenerator = {
	[StatsSelectorKey in keyof EnhancedStatsRepository]: HighlightsGeneratorFor<StatsSelectorKey>;
}[keyof EnhancedStatsRepository];
