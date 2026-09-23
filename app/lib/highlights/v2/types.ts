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
export type VerbApplier = (
	temporalUnit: TemporalUnit | null,
	species: string | undefined,
	usePlural?: boolean
) => string;
export type SpeciesUnitMode = 'replace' | 'prefix' | undefined;
export type HighlightDescriptor = {
	category: HighlightCategory;
	type: string;
	applyVerb: VerbApplier;
	unit: StatUnit;
	speciesUnitMode?: SpeciesUnitMode;
};

type HighlightScope = {
	temporalUnit: TemporalUnit;
	parentTimeWindow?: YearMonthRestriction;
	species?: string;
};

export type HighlightsOfType = {
	descriptor: HighlightDescriptor;
	scope: HighlightScope;
	values: HighlightValue[];
};

type HighlightRanking = {
	highlightIndex: number;
	siblingHighlights: HighlightValue[];
	position: number;
	isTied: boolean;
};

export type CherryPickedHighlight = {
	descriptor: HighlightDescriptor;
	scope: HighlightScope;
	value: HighlightValue;
	ranking: HighlightRanking;
};

export type CombinedHighlights = {
	descriptor: HighlightDescriptor;
	value: HighlightValue;
	species: string | undefined;
	bestPosition: number;
	scopes: {
		scope: HighlightScope;
		ranking: HighlightRanking;
	}[];
};

export type HighlightsGenerator = {
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
