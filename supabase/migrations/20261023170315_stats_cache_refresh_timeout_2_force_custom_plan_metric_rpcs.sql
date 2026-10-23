SET check_function_bodies = false;
ALTER FUNCTION public.stats_cache_basic_session_metrics(text, date, date, bigint, boolean, text, smallint, smallint) SET plan_cache_mode TO 'force_custom_plan';
ALTER FUNCTION public.stats_cache_biometrics_metrics(text, date, date, bigint, boolean, text, smallint, smallint) SET plan_cache_mode TO 'force_custom_plan';
ALTER FUNCTION public.stats_cache_bird_age_metrics(text, date, date, bigint, boolean, text, smallint, smallint) SET plan_cache_mode TO 'force_custom_plan';
ALTER FUNCTION public.stats_cache_encounter_age_metrics(text, date, date, bigint, boolean, text, smallint, smallint) SET plan_cache_mode TO 'force_custom_plan';
ALTER FUNCTION public.stats_cache_new_adult_metrics(text, date, date, bigint, boolean, text, smallint, smallint) SET plan_cache_mode TO 'force_custom_plan';
ALTER FUNCTION public.stats_cache_returning_age_metrics(text, date, date, bigint, boolean, text, smallint, smallint) SET plan_cache_mode TO 'force_custom_plan';
