import type {
	SimpleStatsCacheBySpeciesRow,
	SimpleStatsCacheRow
} from '@/app/models/db';
import type { TemporalUnit } from '@/app/models/temporal-unit';
import type { StatUnit } from '@/app/components/shared/StatOutput';
export type { TemporalUnit } from '@/app/models/temporal-unit';
export type { StatUnit } from '@/app/components/shared/StatOutput';

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

/**
 * Which row shape a rule's `generator` reads. Every rule's stats now come from
 * the same `SimpleStatsCache`/`SimpleStatsCacheBySpecies` read (#1208/#1236),
 * so this is purely a *column-subset label* over that one row set — it names
 * no RPC. It was spelled `rpcName: 'core_stats' | 'biometrics_stats'` back when
 * a rule really did dispatch its own RPC call; `biometrics_stats` has since
 * been deleted from the schema outright (#1246), which would have left the
 * label naming a function that does not exist.
 */

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
	allTimeMonth?: HighlightPositionsLimit;
	month?: HighlightPositionsLimit;
};

// 'all time' / 'all time month' intentionally match temporalUnitNameMapping's
// 'all-time' / 'month-squashed' display strings in app/models/temporal-unit.ts — a
// future change to those display strings should keep this type in sync.
export type ExtendedTemporalUnit = TemporalUnit | 'all time' | 'all time month';
export type CamelCaseExtendedTemporalUnit =
	| TemporalUnit
	| 'allTime'
	| 'allTimeMonth';

export type HighlightOutlook = 'inter' | 'intra';
export type HighlightGenerationConfig = {
	sample: CamelCaseExtendedTemporalUnit;
	lakes: HighlightDataLake;
};

export type ScopeHighlightConfig = {
	intra?: HighlightGenerationConfig[];
	inter?: HighlightGenerationConfig[];
};

export type HighlightPresenceAtScopes = {
	allTime: ScopeHighlightConfig | null;
	year: ScopeHighlightConfig | null;
	allTimeMonth: ScopeHighlightConfig | null;
	month: ScopeHighlightConfig | null;
	day: ScopeHighlightConfig | null;
};

type HighlightPresenceConfig = {
	species: HighlightPresenceAtScopes | null;
	general: HighlightPresenceAtScopes | null;
};
