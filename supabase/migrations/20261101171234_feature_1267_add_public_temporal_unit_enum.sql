ALTER TABLE public."FailedStatsCacheRefreshes" DROP CONSTRAINT failed_stats_cache_refreshes_temporal_unit_check;
ALTER TABLE public."SimpleStatsCache" DROP CONSTRAINT simple_stats_cache_temporal_unit_check;
ALTER TABLE public."SimpleStatsCacheBySpecies" DROP CONSTRAINT simple_stats_cache_by_species_temporal_unit_check;
CREATE TYPE public.temporal_unit AS ENUM ('day', 'month', 'year', 'month-squashed', 'all-time');
ALTER TABLE public."FailedStatsCacheRefreshes" ALTER COLUMN temporal_unit TYPE public.temporal_unit USING temporal_unit::public.temporal_unit;
ALTER TABLE public."SimpleStatsCache" ALTER COLUMN temporal_unit TYPE public.temporal_unit USING temporal_unit::public.temporal_unit;
ALTER TABLE public."SimpleStatsCacheBySpecies" ALTER COLUMN temporal_unit TYPE public.temporal_unit USING temporal_unit::public.temporal_unit;
