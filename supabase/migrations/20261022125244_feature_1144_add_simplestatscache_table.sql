REVOKE SELECT, USAGE ON SEQUENCE public."SimpleStatsCache_id_seq" FROM anon;
REVOKE SELECT, USAGE ON SEQUENCE public."SimpleStatsCache_id_seq" FROM authenticated;
REVOKE SELECT, USAGE ON SEQUENCE public."SimpleStatsCache_id_seq" FROM service_role;
REVOKE DELETE, INSERT, SELECT, UPDATE ON public."SimpleStatsCache" FROM anon;
REVOKE DELETE ON public."SimpleStatsCache" FROM authenticated;
