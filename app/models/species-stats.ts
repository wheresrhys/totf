import type { AggregateStatsResult } from './db';

export type SpeciesStatConfig = {
	label: string;
	property: keyof AggregateStatsResult;
	suffix?: string;
	category?: string;
	prefix?: string;
	invertSort?: boolean;
};

export const speciesStatConfigs: SpeciesStatConfig[] = [
	{
		label: 'Species',
		property: 'species_name',
		invertSort: true
	},
	{
		label: 'Birds',
		property: 'bird_count',
		category: 'Totals',
		suffix: 'birds'
	},
	{
		label: 'Encounters',
		property: 'encounter_count',
		category: 'Totals',
		suffix: 'encounters'
	},
	{
		label: 'Sessions',
		property: 'session_count',
		category: 'Totals',
		suffix: 'sessions'
	},
	{
		label: 'Max per session',
		property: 'max_per_session',
		category: 'Totals',
		prefix: 'max haul:',
		suffix: 'birds'
	},

	// {
	// 	label: '% Birds retrapped',
	// 	property: 'pct_retrapped',
	// 	category: 'Recoveries',
	// 	suffix: '% retrapped'
	// },
	// {
	// 	label: 'Max time span',
	// 	property: 'max_time_span_days',
	// 	category: 'Recoveries',
	// 	prefix: 'max time span:',
	// 	suffix: 'days'
	// },
	// {
	// 	label: 'Max proven age',
	// 	property: 'max_proven_age',
	// 	category: 'Recoveries',
	// 	prefix: 'max proven age:',
	// 	suffix: 'years'
	// },
	// {
	// 	label: 'Most caught bird',
	// 	property: 'max_encountered_bird',
	// 	category: 'Recoveries',
	// 	prefix: 'most seen bird:',
	// 	suffix: 'times'
	// },
	{
		label: 'Max weight',
		property: 'max_weight',
		suffix: 'g',
		category: 'Weight',
		prefix: 'max:'
	},
	{
		label: 'Avg weight',
		property: 'avg_weight',
		suffix: 'g',
		category: 'Weight',
		prefix: 'avg:'
	},
	{
		label: 'Min weight',
		property: 'min_weight',
		suffix: 'g',
		category: 'Weight',
		prefix: 'min:'
	},
	{
		label: 'Median weight',
		property: 'median_weight',
		suffix: 'g',
		category: 'Weight',
		prefix: 'median:'
	},
	{
		label: 'Max wing',
		property: 'max_wing',
		suffix: 'mm',
		category: 'Wing',
		prefix: 'max:'
	},
	{
		label: 'Avg wing',
		property: 'avg_wing',
		suffix: 'mm',
		category: 'Wing',
		prefix: 'avg:'
	},
	{
		label: 'Min wing',
		property: 'min_wing',
		suffix: 'mm',
		category: 'Wing',
		prefix: 'min:'
	},
	{
		label: 'Median wing',
		property: 'median_wing',
		suffix: 'mm',
		category: 'Wing',
		prefix: 'median:'
	}
];
