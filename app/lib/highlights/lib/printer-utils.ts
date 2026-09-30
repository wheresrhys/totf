import type {
	YearMonthRestriction,
	HighlightValue,
	HighlightDescriptor,
	HighlightRanking,
	CombinedHighlight,
	HighlightScope
} from '../types';

import {
	getPlural,
	getSpaceForUnit,
	type TemporalUnit
} from '@/app/components/shared/StatOutput';
const fullMonthNames = [
	undefined,
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

export function printTemporalUnit(
	temporalUnit: TemporalUnit | null,
	usePlural?: boolean
) {
	if (!temporalUnit) return '';

	const base = temporalUnit === 'day' ? 'session' : temporalUnit;

	return usePlural ? getPlural(base) : base;
}

export function pluraliseSpecies(species: string) {
	if (
		species.toLowerCase().endsWith('finch') ||
		species.toLowerCase().endsWith('thrush')
	)
		return `${species}es`;
	if (species.toLowerCase().endsWith('goose'))
		return species.replace(/oose$/, 'eese');
	if (species.includes('(')) return species;
	return `${species}s`;
}

// The species name agreeing with the count the sentence is about: "Robin" for a
// single bird, "Robins" for more. Used by the rarity rules, whose sentences name
// the species instead of a unit ("First Robins ever" rather than "First Robin
// records ever"), so the species name is what has to agree with the value.
export function printSpeciesForCount(
	species: string | undefined,
	count: number
) {
	if (!species) return '';
	return count > 1 ? pluraliseSpecies(species) : species;
}

export function printValue(
	value: HighlightValue,
	descriptor: HighlightDescriptor
) {
	switch (descriptor.speciesUnitMode) {
		case 'replace':
			if (value.species) {
				return `${value.value} ${value.value > 1 ? pluraliseSpecies(value.species) : ''}`;
			}
		case 'prefix':
			if (value.species) {
				return `${value.value}${getSpaceForUnit(descriptor.unit)}${value.species} ${value.value > 1 ? getPlural(descriptor.unit) : descriptor.unit}`;
			}
		default:
			return `${value.value}${getSpaceForUnit(descriptor.unit)}${value.value > 1 ? getPlural(descriptor.unit) : descriptor.unit}`;
	}
}

export function prettyPrintPosition(position: number) {
	switch (position) {
		case 1:
			return '';
		case 2:
			return 'second';
		case 3:
			return 'third';
		case 4:
			return 'fourth';
		case 5:
			return 'fifth';
		default:
			throw new Error('Should not be showing anything worse than fifth best');
	}
}

export function printProminenceQualifier(
	{ position, isTied }: HighlightRanking,
	tiedQualifier: string = 'joint'
) {
	return `${isTied ? `${tiedQualifier ?? 'joint'} ` : ''}${prettyPrintPosition(position)}`.trim();
}

export function printFullMonthName(monthIndex: number) {
	return fullMonthNames[monthIndex];
}
export type TimeQualifierOptions = {
	yearConnector?: 'in' | 'of';
	monthConnector?: 'in' | 'of';
	yearMonthConnector?: 'in' | 'of';
};

export function printTimeQualifier(
	timeQualifier: YearMonthRestriction | undefined,
	options: TimeQualifierOptions = {}
) {
	options = {
		...{
			yearConnector: 'of',
			monthConnector: 'in',
			yearMonthConnector: 'of'
		},
		...options
	};

	if (!timeQualifier) {
		return 'ever';
	}
	const { year, month } = timeQualifier;
	if (year && month) {
		// todo pretty print month
		return year === new Date().getFullYear()
			? `this ${month}`
			: `${options.monthConnector ?? 'of'} ${month} ${year}`;
	} else if (year) {
		return year === new Date().getFullYear()
			? `this year`
			: `${options.yearConnector ?? 'of'} ${year}`;
	} else if (month) {
		return `${options.monthConnector ?? 'in'} any ${fullMonthNames[month]}`;
	}
}
// todo enforce length of min 1 in the types
function sentenceJoin(clauses: string[]): string {
	// if (clauses.length) {
	// 	throw new Error('combined highlight with no scopes listed');
	// }
	let sentence = clauses.pop() as string;

	if (clauses.length) {
		sentence = `${clauses.pop()} and ${sentence}`;
	}

	if (clauses.length) {
		sentence = `${clauses.join(', ')}, ${sentence}`;
	}

	return sentence;
}

function sentenceCase(sentence: string): string {
	return sentence.charAt(0).toUpperCase() + sentence.substring(1);
}

type LineItemInput = {
	scope: HighlightScope;
	ranking: HighlightRanking;
	combinedHighlight: CombinedHighlight;
	index: number;
};
export function printCombinedHighlight(
	combinedHighlight: CombinedHighlight,
	{
		firstLineItem,
		lineItem,
		onlyBroadestScope,
		shouldPrintValue
	}: {
		firstLineItem?: (input: Omit<LineItemInput, 'index'>) => string;
		lineItem: (input: LineItemInput) => string;
		shouldPrintValue: boolean;
		// Some metrics (first/only/rare species records) are the same fact whichever
		// scope they were found at, so a narrower scope is discarded rather than
		// combined into the sentence — set this instead of relying on firstLineItem,
		// which still prints every scope.
		onlyBroadestScope?: boolean;
	}
): string {
	const scopes = onlyBroadestScope
		? combinedHighlight.scopes.slice(0, 1)
		: combinedHighlight.scopes;
	let result = sentenceJoin(
		scopes.map((scope, index) =>
			index === 0 && firstLineItem
				? firstLineItem({ ...scope, combinedHighlight })
				: lineItem({ ...scope, combinedHighlight, index })
		)
	);

	if (shouldPrintValue) {
		result += `: ${printValue(combinedHighlight.value, combinedHighlight.descriptor)}`;
	}
	return sentenceCase(result.trim().replace(/  /g, ' '));
}
