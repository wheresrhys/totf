import { describe, it, expect } from 'vitest';

import { getTimeWindow, getPresence } from '../scope-config';
import type {
	HighlightsGenerator,
	HighlightPresenceAtScopes,
	HighlightGenerationConfig
} from '../../../types';

describe('getTimeWindow', () => {
	it('returns undefined when no timePeriod is given', () => {
		expect(getTimeWindow(null, 'month')).toBeUndefined();
	});

	it("returns { month, year } for temporalUnit 'month'", () => {
		expect(getTimeWindow('2020-05-10', 'month')).toStrictEqual({
			year: 2020,
			month: 5
		});
	});

	it("returns { year } only for temporalUnit 'year'", () => {
		expect(getTimeWindow('2020-05-10', 'year')).toStrictEqual({
			year: 2020
		});
	});

	it("returns { month } only for temporalUnit 'month-squashed'", () => {
		expect(getTimeWindow('2020-05-10', 'month-squashed')).toStrictEqual({
			month: 5
		});
	});

	it("returns undefined for temporalUnit 'all-time'", () => {
		expect(getTimeWindow('2020-05-10', 'all-time')).toBeUndefined();
	});
});

describe('getPresence', () => {
	const generationConfig = (
		sample: HighlightGenerationConfig['sample']
	): HighlightGenerationConfig => ({ sample, lakes: {} });

	const presenceAtScopes = (
		overrides: Partial<HighlightPresenceAtScopes> = {}
	): HighlightPresenceAtScopes => ({
		day: null,
		month: null,
		year: null,
		allTime: null,
		monthSquashed: null,
		...overrides
	});

	const rule = (
		presence: HighlightsGenerator['presence']
	): HighlightsGenerator => ({ presence }) as HighlightsGenerator;

	it('returns an empty array when the rule has no presence config at all', () => {
		expect(getPresence(rule(undefined), 'day', 'inter')).toStrictEqual([]);
	});

	it('reads from presence.species when a species is given', () => {
		const speciesConfig = [generationConfig('month')];
		const generalConfig = [generationConfig('year')];
		const testRule = rule({
			species: presenceAtScopes({ month: { inter: speciesConfig } }),
			general: presenceAtScopes({ month: { inter: generalConfig } })
		});

		expect(getPresence(testRule, 'month', 'inter', 'Blackbird')).toBe(
			speciesConfig
		);
	});

	it('reads from presence.general when no species is given', () => {
		const speciesConfig = [generationConfig('month')];
		const generalConfig = [generationConfig('year')];
		const testRule = rule({
			species: presenceAtScopes({ month: { inter: speciesConfig } }),
			general: presenceAtScopes({ month: { inter: generalConfig } })
		});

		expect(getPresence(testRule, 'month', 'inter')).toBe(generalConfig);
	});

	it('returns undefined for a species lookup when presence.species itself is not configured', () => {
		const testRule = rule({
			species: null,
			general: presenceAtScopes({ month: { inter: [generationConfig('month')] } })
		});

		expect(
			getPresence(testRule, 'month', 'inter', 'Blackbird')
		).toBeUndefined();
	});

	it('returns undefined for a temporal-unit entry with no matching outlook', () => {
		const testRule = rule({
			species: null,
			general: presenceAtScopes({ year: { inter: [generationConfig('year')] } })
		});

		expect(getPresence(testRule, 'year', 'intra')).toBeUndefined();
	});
});
