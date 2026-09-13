-- Read-only impersonation role for safe debugging against production data.
-- See supabase/schema/cluster/roles.sql for the declarative source of truth.
-- (Hand-adjusted: the generated diff produced an invalid ADMIN OPTION grant and
-- omitted the role memberships, which pg-delta does not track.)
create role app_readonly;
grant app_readonly to authenticator;
grant authenticated to app_readonly;
alter role app_readonly set transaction_read_only = 'on';
-- PostgREST caches role settings; reload config so the setting applies without a restart.
notify pgrst, 'reload config';
