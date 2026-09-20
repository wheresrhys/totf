import type {
	Highlight,
	HighlightUnit,
	HighlightsOfType,
	HighlightTemporalUnit,
	HighlightInContext,
	YearMonthRestriction
} from './';

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
	siblingHighlights,
	highlightIndex
}: {
	siblingHighlights: Highlight[];
	highlightIndex: number;
}) {
	const activeHighlight = siblingHighlights[highlightIndex];
	const activeValue = activeHighlight.value;
	const allValues = [
		...new Set(siblingHighlights.map(({ value }) => value))
	].sort((a, b) => b - a);
	const position = allValues.indexOf(activeValue) + 1;
	const isJoint =
		siblingHighlights.filter(({ value }) => value === activeValue).length > 1;

	return `${isJoint ? 'Joint ' : ''}${prettyPrintPosition(position)}`;
}

export function printTimeQualifier({ year, month }: YearMonthRestriction) {
	if (year && month) {
		// todo pretty print month
		return year === new Date().getFullYear()
			? `this ${month}`
			: `in ${month} ${year}`;
	} else if (year) {
		return year === new Date().getFullYear() ? `this year` : `in ${year}`;
	} else if (month) {
		return `in any ${month}`;
	} else {
		return `ever`;
	}
}

export function printSingleHighlightSentence({
	parentTimeWindow,
	siblingHighlights,
	highlightIndex,
	verb,
	temporalUnit,
	value,
	unit
}: HighlightInContext) {
	return `${printProminenceQualifier({ highlightIndex, siblingHighlights })} ${printDescriptor({ verb, temporalUnit })} ${printTimeQualifier(parentTimeWindow || {})}: ${printValue(value, unit)}`.trim();
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
