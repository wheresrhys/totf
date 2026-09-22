import type {
	HighlightsOfType,
	CherryPickedHighlight,
	CombinedHighlights,
	YearMonthRestriction,
	HighlightValue,
	HighlightDescriptor
} from './types';
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

function printTemporalUnit(temporalUnit: TemporalUnit) {
	return temporalUnit === 'day' ? 'session' : temporalUnit;
}

export function printValue(
	value: HighlightValue,
	descriptor: HighlightDescriptor
) {
	switch (descriptor.speciesUnitMode) {
		case 'replace':
			return `${value.value} ${value.species}${value.value > 1 ? 's' : ''}`;
		case 'prefix':
			return `${value.value} ${value.species} ${value.value > 1 ? getPlural(descriptor.unit) : descriptor.unit}`;
		default:
			return `${value.value} ${value.value > 1 ? getPlural(descriptor.unit) : descriptor.unit}`;
	}
}

export function printDescriptor({
	verb,
	usePlural = false,
	temporalUnit
}: {
	verb: string;
	usePlural?: boolean;
	temporalUnit: TemporalUnit;
}) {
	return `${verb.toLowerCase()} ${usePlural ? getPlural(printTemporalUnit(temporalUnit)) : printTemporalUnit(temporalUnit)}`;
}

function prettyPrintPosition(position: number) {
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
			throw new Error('Should not be showing anything worse than 3rd best');
	}
}

export function printProminenceQualifier({
	ranking: { position, isTied }
}: CherryPickedHighlight) {
	return `${isTied ? 'joint ' : ''}${prettyPrintPosition(position)}`;
}

export function printTimeQualifier({ year, month }: YearMonthRestriction) {
	if (year && month) {
		// todo pretty print month
		return year === new Date().getFullYear()
			? `this ${month}`
			: `of ${month} ${year}`;
	} else if (year) {
		return year === new Date().getFullYear() ? `this year` : `in ${year}`;
	} else if (month) {
		return `in any ${fullMonthNames[month]}`;
	} else {
		return `ever`;
	}
}

function printSingleHighlightPreamble(highlight: CherryPickedHighlight) {
	return `${printProminenceQualifier(highlight)} ${printDescriptor({
		verb: highlight.descriptor.verb,
		usePlural: false,
		temporalUnit: highlight.scope.temporalUnit
	})} ${printTimeQualifier(highlight.scope.parentTimeWindow || {})}`;
}

export function printSingleHighlightSentence(highlight: CherryPickedHighlight) {
	return sentenceCase(
		`${printSingleHighlightPreamble(highlight)}: ${printValue(highlight.value, highlight.descriptor)}`.trim()
	);
}

function sentenceJoin(clauses: string[]) {
	let sentence = clauses.pop();

	if (clauses.length) {
		sentence = `${clauses.pop()} and ${sentence}`;
	}

	if (clauses.length) {
		sentence = `${clauses.join(', ')}, ${sentence}`;
	}

	return sentence;
}

function sentenceCase(sentence: string) {
	return sentence.charAt(0).toUpperCase() + sentence.substring(1);
}

export function printMultipleHighlightSentence(highlight: CombinedHighlights) {
	const preambles = highlight.scopes.map((scope) =>
		printSingleHighlightPreamble({
			...scope,
			descriptor: highlight.descriptor,
			value: highlight.value
		})
	);
	return sentenceCase(
		`${sentenceJoin(preambles)}: ${printValue(highlight.value, highlight.descriptor)}`.trim()
	);
}

export function printHighlightListPrefix({
	descriptor: { verb },
	scope: { temporalUnit },
	values
}: HighlightsOfType) {
	return sentenceCase(
		printDescriptor({
			verb,
			temporalUnit,
			usePlural: values.length > 1
		})
	);
}
