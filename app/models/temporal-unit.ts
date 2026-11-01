import { Database } from '@/types/supabase.types';

export type StatsTemporalUnit = Database['public']['Enums']['temporal_unit'];
export type TemporalUnit = Extract<StatsTemporalUnit, 'day' | 'month' | 'year'>;
export type ExactFilterTemporalUnit = Extract<
	StatsTemporalUnit,
	'month' | 'year' | 'month-squashed'
>;

export const temporalUnitNameMapping: Record<StatsTemporalUnit, string> = {
	day: 'day',
	month: 'month',
	year: 'year',
	'month-squashed': 'all time month',
	'all-time': 'all time'
};
