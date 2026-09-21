export type OneBasedMonth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type YearMonthRestriction = {
	year?: number;
	month?: OneBasedMonth;
};
export type HighlightUnit = 'bird' | 'species' | 'encounter';
export type HighlightTemporalUnit = 'day' | 'month' | 'year';
export type HighlightCategory = 'count' | 'rarity' | 'biometrics';
export type HighlightType =
	| 'birds'
	| 'encounters'
	| 'species'
	| 'newBirds'
	| 'juvs';

export type Highlight = {
	time_period: string;
	value: number;
};

export type HighlightsOfType = {
	type: HighlightType;
	verb: string;
	temporalUnit: HighlightTemporalUnit;
	unit: HighlightUnit;
	category: HighlightCategory;
	highlights: Highlight[];
};

export type HighlightInContext = {
	type: HighlightType;
	parentTimeWindow?: YearMonthRestriction;
	verb: string;
	temporalUnit: HighlightTemporalUnit;
	unit: HighlightUnit;
	category: HighlightCategory;
	highlightIndex: number;
	siblingHighlights: Highlight[];
	value: number;
	timePeriod: string;
	position: number;
	isTied: boolean;
};
