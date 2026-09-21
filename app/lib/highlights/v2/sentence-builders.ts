import type {
	HighlightsOfType,
	CherryPickedHighlight,
	YearMonthRestriction
} from './types';
import type {
	TemporalUnit,
	StatUnit
} from '@/app/components/shared/StatOutput';

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

export function printValue(value: number, unit: StatUnit) {
	return `${value} ${value > 1 ? getPlural(unit) : unit}`;
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
	return `${verb} ${usePlural ? getPlural(temporalUnit) : temporalUnit}`;
}

function prettyPrintPosition(position: number) {
	switch (position) {
		case 1:
			return '';
		case 2:
			return 'Second';
		case 3:
			return 'Third';
		case 4:
			return 'Fourth';
		case 5:
			return 'Fifth';
		default:
			throw new Error('Should not be showing anything worse than 3rd best');
	}
}

export function printProminenceQualifier({
	ranking: { position, isTied }
}: CherryPickedHighlight) {
	return `${isTied ? 'Joint ' : ''}${prettyPrintPosition(position)}`;
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

export function printSingleHighlightSentence(highlight: CherryPickedHighlight) {
	return `${printProminenceQualifier(highlight)} ${printDescriptor({
		verb: highlight.verb,
		usePlural: false,
		temporalUnit: highlight.scope.temporalUnit
	})} ${printTimeQualifier(highlight.scope.parentTimeWindow || {})}: ${printValue(highlight.value.value, highlight.unit)}`.trim();
}

export function printHighlightListPrefix({
	verb,
	scope: { temporalUnit },
	values
}: HighlightsOfType) {
	return printDescriptor({
		verb,
		temporalUnit,
		usePlural: values.length > 1
	});
}
