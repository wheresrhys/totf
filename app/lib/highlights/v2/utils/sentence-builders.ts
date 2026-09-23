import type {
	YearMonthRestriction,
	HighlightValue,
	HighlightDescriptor,
	HighlightRanking
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
			throw new Error('Should not be showing anything worse than 3rd best');
	}
}

export function printProminenceQualifier({
	position,
	isTied
}: HighlightRanking) {
	return `${isTied ? 'joint ' : ''}${prettyPrintPosition(position)}`;
}

export function printFullMonthName(monthIndex: number) {
	return fullMonthNames[monthIndex];
}

export function printTimeQualifier(
	{ year, month }: YearMonthRestriction,
	connector?: 'in' | 'of'
) {
	if (year && month) {
		// todo pretty print month
		return year === new Date().getFullYear()
			? `this ${month}`
			: `${connector ?? 'of'} ${month} ${year}`;
	} else if (year) {
		return year === new Date().getFullYear()
			? `this year`
			: `${connector ?? 'of'} ${year}`;
	} else if (month) {
		return `${connector ?? 'in'} any ${fullMonthNames[month]}`;
	} else {
		return `ever`;
	}
}

export function sentenceJoin(clauses: string[]) {
	let sentence = clauses.pop();

	if (clauses.length) {
		sentence = `${clauses.pop()} and ${sentence}`;
	}

	if (clauses.length) {
		sentence = `${clauses.join(', ')}, ${sentence}`;
	}

	return sentence;
}

export function sentenceCase(sentence: string) {
	return sentence.charAt(0).toUpperCase() + sentence.substring(1);
}
