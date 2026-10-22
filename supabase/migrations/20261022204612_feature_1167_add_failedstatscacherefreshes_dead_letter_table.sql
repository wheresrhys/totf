REVOKE SELECT, USAGE ON SEQUENCE public."FailedStatsCacheRefreshes_id_seq" FROM anon;
REVOKE SELECT, USAGE ON SEQUENCE public."FailedStatsCacheRefreshes_id_seq" FROM authenticated;
REVOKE SELECT, USAGE ON SEQUENCE public."FailedStatsCacheRefreshes_id_seq" FROM service_role;
REVOKE DELETE, INSERT, SELECT, UPDATE ON public."FailedStatsCacheRefreshes" FROM anon;
REVOKE DELETE, UPDATE ON public."FailedStatsCacheRefreshes" FROM authenticated;
