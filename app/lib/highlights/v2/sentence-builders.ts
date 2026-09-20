import type {
	HighlightUnit,
	HighlightsOfType,
	HighlightTemporalUnit,
	HighlightInContext,
	YearMonthRestriction
} from './';

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

const plurals: Partial<Record<HighlightUnit | HighlightTemporalUnit, string>> =
	{
		species: 'species'
	};

function getPlural(unit: HighlightUnit | HighlightTemporalUnit): string {
	return unit in plurals ? (plurals[unit] as string) : `${unit}s`;
}
export function printValue(value: number, unit: HighlightUnit) {
	return `${value} ${value > 1 ? getPlural(unit) : unit}`;
}

export function printDescriptor({
	verb,
	usePlural = false,
	temporalUnit
}: {
	verb: string;
	usePlural?: boolean;
	temporalUnit: HighlightTemporalUnit;
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
		default:
			throw new Error('Should not be showing anything worse than 3rd best');
	}
}

export function printProminenceQualifier({
	position,
	isTied
}: HighlightInContext) {
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

export function printSingleHighlightSentence(highlight: HighlightInContext) {
	return `${printProminenceQualifier(highlight)} ${printDescriptor(highlight)} ${printTimeQualifier(highlight.parentTimeWindow || {})}: ${printValue(highlight.value, highlight.unit)}`.trim();
}

export function printHighlightListPrefix({
	verb,
	temporalUnit,
	highlights
}: HighlightsOfType) {
	return printDescriptor({
		verb,
		temporalUnit,
		usePlural: highlights.length > 1
	});
}
