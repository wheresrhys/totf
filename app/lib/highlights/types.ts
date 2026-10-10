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

export type HighlightsOfType = {
	formatters: HighlightFormatters;
	descriptor: HighlightDescriptor;
	scope: HighlightScope;
	values: HighlightValue[];
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
	rpcName: 'core_stats' | 'biometrics_stats';
	speciesUsed: 'none' | 'present' | 'grouped';
	presence?: HighlightPresenceConfig;
	generator: (
		stats: StatsRowOf<EnhancedStatsRepository[StatsSelectorKey]>[],
		scope?: HighlightScope
	) => HighlightValue[];
	condition?: (scope: HighlightScope) => boolean;
};

export type HighlightsGenerator = {
	[StatsSelectorKey in keyof EnhancedStatsRepository]: HighlightsGeneratorFor<StatsSelectorKey>;
}[keyof EnhancedStatsRepository];

type HighlightPositionsLimit = 1 | 2 | 3;

export type HighlightInitConfig = {
	selfRelativeToParentMonth?: HighlightPositionsLimit;
	selfRelativeToParentYear?: HighlightPositionsLimit;
	selfRelativeToAllTimeMonth?: HighlightPositionsLimit;
	selfRelativeToAllTime?: HighlightPositionsLimit;
	childSessionsRelativeToSelf?: HighlightPositionsLimit;
	childSessionsRelativeToParentYear?: HighlightPositionsLimit;
	childSessionsRelativeToAllTimeMonth?: HighlightPositionsLimit;
	childSessionsRelativeToAllTime?: HighlightPositionsLimit;
	childMonthsRelativeToSelf?: HighlightPositionsLimit;
	childMonthsRelativeToParentYear?: HighlightPositionsLimit;
	childMonthsRelativeToAllTime?: HighlightPositionsLimit;
};

export type HighlightDataLake = {
	relativeToAllTime?: number;
	relativeToYear?: number;
	relativeToAllTimeMonth?: number;
	relativeToMonth?: number;
};

type AllTimeHighlightDataLake = Pick<HighlightDataLake, 'relativeToAllTime'>;
type YearHighlightDataLake = Pick<
	HighlightDataLake,
	'relativeToAllTime' | 'relativeToYear'
>;
type MonthHighlightDataLake = Pick<
	HighlightDataLake,
	'relativeToAllTime' | 'relativeToYear' | 'relativeToMonth'
>;

type AllTimeMonthHighlightDataLake = Pick<
	HighlightDataLake,
	'relativeToAllTime' | 'relativeToAllTimeMonth'
>;

export type ExtendedTemporalUnit = TemporalUnit | 'all time' | 'all time month';
export type HighlightIterator = 'perDay' | 'perMonth' | 'perYear';
export type HighlightPageLevelPresence = Record<
	HighlightIterator,
	HighlightDataLake
>;

export type HighlightPresenceAtScopes = {
	allTime: {
		perYear?: AllTimeHighlightDataLake;
		perMonth?: AllTimeHighlightDataLake;
		perDay?: AllTimeHighlightDataLake;
	} | null;
	year: {
		perYear?: AllTimeHighlightDataLake;
		perMonth?: YearHighlightDataLake;
		perDay?: YearHighlightDataLake;
	} | null;
	allTimeMonth: {
		perMonth?: AllTimeMonthHighlightDataLake;
		perDay?: AllTimeMonthHighlightDataLake;
	} | null;
	month: {
		perMonth?: YearHighlightDataLake;
		perDay?: MonthHighlightDataLake;
	} | null;
	day: {
		perDay?: HighlightDataLake;
	} | null;
};

type HighlightPresenceConfig = {
	species: HighlightPresenceAtScopes | null;
	general: HighlightPresenceAtScopes | null;
};
