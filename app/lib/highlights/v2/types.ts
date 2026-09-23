import type { CoreStatsResult } from '@/app/models/db';
import type {
	TemporalUnit,
	StatUnit
} from '@/app/components/shared/StatOutput';
import type { StatsRepository } from '@/app/actions/highlights-data';

export interface TimePeriodedItem {
	time_period: string | null;
}
export type YearMonthRestriction = {
	year?: number;
	month?: number;
};
export type HighlightCategory = 'count' | 'rarity' | 'biometrics';

export type HighlightValue = {
	timePeriod: string;
	value: number;
	species: string | null;
};

export type SpeciesUnitMode = 'replace' | 'prefix' | undefined;
export type HighlightDescriptor = {
	category: HighlightCategory;
	type: string;
	unit: StatUnit;
	speciesUnitMode?: SpeciesUnitMode;
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

export type HighlightsGenerator = {
	formatters: HighlightFormatters;
	descriptor: HighlightDescriptor;
	limit?: number;
	statsSelector: (
		stats: StatsRepository<CoreStatsResult>
	) => CoreStatsResult[] | Record<string, CoreStatsResult[]>;
	generator: (stats: CoreStatsResult[]) => HighlightValue[];
	condition?: (
		temporalUnit: TemporalUnit,
		parentTimeWindow?: YearMonthRestriction
	) => boolean;
};
