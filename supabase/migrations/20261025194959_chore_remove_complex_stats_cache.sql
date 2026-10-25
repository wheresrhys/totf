SET check_function_bodies = false;
DROP FUNCTION public.stats_cache_new_adult_metrics(species_name_filter text, from_date date, to_date date, ringing_group_filter bigint, group_by_species boolean, group_by_time_period text, year_filter smallint, month_filter smallint);
DROP TYPE public.stats_cache_new_adult_metrics_result;
DROP FUNCTION public.stats_cache_returning_age_metrics(species_name_filter text, from_date date, to_date date, ringing_group_filter bigint, group_by_species boolean, group_by_time_period text, year_filter smallint, month_filter smallint);
DROP TYPE public.stats_cache_returning_age_metrics_result;
ALTER TABLE public."FailedStatsCacheRefreshes" DROP CONSTRAINT failed_stats_cache_refreshes_cache_table_check;
DROP TRIGGER trigger_trg_set_updated_at ON public."ComplexStatsCache";
DROP TRIGGER trigger_trg_set_updated_at ON public."ComplexStatsCacheBySpecies";
DROP POLICY group_complex_stats_cache_access ON public."ComplexStatsCache";
DROP POLICY group_complex_stats_cache_insert ON public."ComplexStatsCache";
DROP POLICY group_complex_stats_cache_update ON public."ComplexStatsCache";
DROP TABLE public."ComplexStatsCache";
DROP POLICY group_complex_stats_cache_by_species_access ON public."ComplexStatsCacheBySpecies";
DROP POLICY group_complex_stats_cache_by_species_insert ON public."ComplexStatsCacheBySpecies";
DROP POLICY group_complex_stats_cache_by_species_update ON public."ComplexStatsCacheBySpecies";
DROP TABLE public."ComplexStatsCacheBySpecies";

-- Hand-written backfill (declarative sync only emits DDL): the narrowed CHECK
-- below rejects any row still tagged with a dropped Complex cache name, so
-- purge the historical dead-letter rows that logged a failed write to a
-- cache that no longer exists before adding it.
DELETE FROM public."FailedStatsCacheRefreshes"
WHERE
	cache_table IN ('ComplexStatsCache', 'ComplexStatsCacheBySpecies');

ALTER TABLE public."FailedStatsCacheRefreshes" ADD CONSTRAINT failed_stats_cache_refreshes_cache_table_check CHECK (cache_table = ANY (ARRAY['SimpleStatsCache'::text, 'SimpleStatsCacheBySpecies'::text]));
