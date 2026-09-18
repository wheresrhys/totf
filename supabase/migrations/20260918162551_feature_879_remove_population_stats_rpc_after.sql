SET check_function_bodies = false;
DROP FUNCTION public.population_stats(species_name_filter text, from_date date, to_date date, ringing_group_filter bigint, group_by_species boolean, group_by_time_period text);
DROP TYPE public.population_stats_result;
