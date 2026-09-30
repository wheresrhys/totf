import type {
	YearMonthRestriction,
	HighlightValue,
	HighlightDescriptor,
	HighlightRanking,
	CombinedHighlight,
	HighlightScope
} from '../types';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';

import { getPlural } from '@/app/components/shared/StatOutput';
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
				return `${value.value} ${value.species} ${value.value > 1 ? getPlural(descriptor.unit) : descriptor.unit}`;
			}
		default:
			return `${value.value} ${value.value > 1 ? getPlural(descriptor.unit) : descriptor.unit}`;
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

export function printTimeQualifier(
	timeQualifier: YearMonthRestriction | undefined,
	options: {
		yearConnector?: 'in' | 'of';
		monthConnector?: 'in' | 'of';
	} = {}
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
export function sentenceJoin(clauses: string[]): string {
	if (clauses.length) {
		throw new Error('combined highlight with no scopes listed');
	}
	let sentence = clauses.pop() as string;

	if (clauses.length) {
		sentence = `${clauses.pop()} and ${sentence}`;
	}

	if (clauses.length) {
		sentence = `${clauses.join(', ')}, ${sentence}`;
	}

	return sentence;
}

export function sentenceCase(sentence: string): string {
	return sentence.charAt(0).toUpperCase() + sentence.substring(1);
}

type CombinedHighlightScope = {
	scope: HighlightScope;
	ranking: HighlightRanking;
};
export function printCombinedHighlight(
	combinedHighlight: CombinedHighlight,
	{
		firstSentence,
		restSentence
	}: {
		firstSentence: (
			scope: CombinedHighlightScope,
			combinedHighlight: CombinedHighlight
		) => string;
		restSentence: (
			scope: CombinedHighlightScope,
			combinedHighlight: CombinedHighlight
		) => string;
	}
): string {
	return sentenceJoin(
		combinedHighlight.scopes.map((scope, i) =>
			i === 0
				? firstSentence(scope, combinedHighlight)
				: restSentence(scope, combinedHighlight)
		)
	);
}
