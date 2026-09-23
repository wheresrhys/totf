import type {
	HighlightsOfType,
	CherryPickedHighlight,
	CombinedHighlights,
	YearMonthRestriction,
	HighlightValue,
	HighlightDescriptor,
	VerbApplier
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
	applyVerb,
	usePlural = false,
	temporalUnit,
	species
}: {
	applyVerb: VerbApplier;
	usePlural?: boolean;
	temporalUnit: TemporalUnit | null;
	species?: string;
}) {
	return applyVerb(temporalUnit, species, usePlural).toLowerCase();
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
	return `${isTied ? 'equal ' : ''}${prettyPrintPosition(position)}`;
}

export function printTimeQualifier({ year, month }: YearMonthRestriction) {
	if (year && month) {
		// todo pretty print month
		return year === new Date().getFullYear()
			? `this ${month}`
			: `of ${month} ${year}`;
	} else if (year) {
		return year === new Date().getFullYear() ? `this year` : `of ${year}`;
	} else if (month) {
		return `in any ${fullMonthNames[month]}`;
	} else {
		return `ever`;
	}
}

function printSingleHighlightPreamble(
	highlight: CherryPickedHighlight & { suppressTemporalUnit?: boolean }
) {
	return `${printProminenceQualifier(highlight)} ${printDescriptor({
		applyVerb: highlight.descriptor.applyVerb,
		usePlural: false,
		temporalUnit: highlight.suppressTemporalUnit
			? null
			: highlight.scope.temporalUnit,
		species: highlight.scope.species
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
	const preambles = highlight.scopes.map((scope, i) =>
		printSingleHighlightPreamble({
			...scope,
			descriptor: highlight.descriptor,
			value: highlight.value,
			suppressTemporalUnit: i > 0
		})
	);
	return sentenceCase(
		`${sentenceJoin(preambles)}: ${printValue(highlight.value, highlight.descriptor)}`.trim()
	);
}

export function printHighlightListPrefix({
	descriptor: { applyVerb },
	scope: { temporalUnit },
	values
}: HighlightsOfType) {
	return sentenceCase(
		printDescriptor({
			applyVerb,
			temporalUnit,
			usePlural: values.length > 1
		})
	);
}
