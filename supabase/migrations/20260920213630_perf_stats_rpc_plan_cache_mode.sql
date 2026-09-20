SET check_function_bodies = false;
ALTER FUNCTION public.arrivals_stats(text, date, date, bigint, boolean, text) SET plan_cache_mode TO 'force_custom_plan';
ALTER FUNCTION public.biometrics_stats(text, date, date, bigint, boolean, text) SET plan_cache_mode TO 'force_custom_plan';
ALTER FUNCTION public.core_stats(text, date, date, bigint, boolean, text) SET plan_cache_mode TO 'force_custom_plan';
ALTER FUNCTION public.demographics_stats(text, date, date, bigint, boolean, text) SET plan_cache_mode TO 'force_custom_plan';
