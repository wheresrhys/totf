import type {
	TemporalUnit,
	StatUnit
} from '@/app/components/shared/StatOutput';

export type YearMonthRestriction = {
	year?: number;
	month?: number;
};
export type HighlightCategory = 'count' | 'rarity' | 'biometrics';

export type HighlightValue = {
	timePeriod: string;
	value: number;
};

export type HighlightContext = {
	category: HighlightCategory;
	type: string;
	verb: string;
	unit: StatUnit;
};

type HighlightScope = {
	temporalUnit: TemporalUnit;
	parentTimeWindow?: YearMonthRestriction;
};

export type HighlightsOfType = HighlightContext & {
	scope: HighlightScope;
	values: HighlightValue[];
};

type HighlightRankingContext = {
	highlightIndex: number;
	siblingHighlights: HighlightValue[];
	position: number;
	isTied: boolean;
};

export type CherryPickedHighlight = HighlightContext & {
	scope: HighlightScope;
	value: HighlightValue;
	ranking: HighlightRankingContext;
};
