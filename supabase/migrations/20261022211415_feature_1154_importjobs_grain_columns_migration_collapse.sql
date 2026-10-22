ALTER TABLE public."ImportJobs" DROP COLUMN biometrics_stats_refresh_status;
ALTER TABLE public."ImportJobs" DROP COLUMN core_stats_refresh_status;
ALTER TABLE public."ImportJobs" DROP COLUMN demographics_stats_refresh_status;
COMMENT ON TABLE public."ImportJobs" IS 'One row per CSV import run: row counts, start/finish, overall outcome, dates covered, and the outcome of each temporal unit''s stats-cache refresh tracked independently';
ALTER TABLE public."ImportJobs" ADD COLUMN day_stats_refresh_status public.import_job_status DEFAULT 'in_progress'::public.import_job_status NOT NULL;
ALTER TABLE public."ImportJobs" ADD COLUMN month_stats_refresh_status public.import_job_status DEFAULT 'in_progress'::public.import_job_status NOT NULL;
ALTER TABLE public."ImportJobs" ADD COLUMN year_stats_refresh_status public.import_job_status DEFAULT 'in_progress'::public.import_job_status NOT NULL;
ALTER TABLE public."ImportJobs" ADD COLUMN month_squashed_stats_refresh_status public.import_job_status DEFAULT 'in_progress'::public.import_job_status NOT NULL;
ALTER TABLE public."ImportJobs" ADD COLUMN all_time_stats_refresh_status public.import_job_status DEFAULT 'in_progress'::public.import_job_status NOT NULL;
