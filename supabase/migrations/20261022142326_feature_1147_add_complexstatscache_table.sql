REVOKE SELECT, USAGE ON SEQUENCE public."ComplexStatsCache_id_seq" FROM anon;
REVOKE SELECT, USAGE ON SEQUENCE public."ComplexStatsCache_id_seq" FROM authenticated;
REVOKE SELECT, USAGE ON SEQUENCE public."ComplexStatsCache_id_seq" FROM service_role;
REVOKE DELETE, INSERT, SELECT, UPDATE ON public."ComplexStatsCache" FROM anon;
REVOKE DELETE ON public."ComplexStatsCache" FROM authenticated;
