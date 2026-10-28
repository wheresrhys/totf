SET check_function_bodies = false;
DROP FUNCTION public.biometrics_stats(species_name_filter text, from_date date, to_date date, ringing_group_filter bigint, group_by_species boolean, group_by_time_period text, year_filter smallint, month_filter smallint);
DROP TYPE public.biometrics_stats_result;
