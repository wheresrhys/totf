ALTER TABLE public."FailedStatsCacheRefreshes" DROP CONSTRAINT failed_stats_cache_refreshes_cache_table_check;
ALTER TABLE public."FailedStatsCacheRefreshes" ADD CONSTRAINT failed_stats_cache_refreshes_cache_table_check CHECK (cache_table = ANY (ARRAY['SimpleStatsCache'::text, 'SimpleStatsCacheBySpecies'::text, 'ComplexStatsCache'::text, 'ComplexStatsCacheBySpecies'::text]));
