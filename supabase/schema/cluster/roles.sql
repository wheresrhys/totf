-- claude_readonly: read-only impersonation role for safe debugging against production data.
--
-- Inherits authenticated's table grants and RLS policies via role membership.
-- PostgREST applies the role's transaction_read_only setting when impersonating it,
-- so every write (INSERT/UPDATE/DELETE/DDL) fails with Postgres error 25006.
-- Note: must be transaction_read_only, not default_transaction_read_only — PostgREST
-- applies role settings with SET LOCAL inside the already-open transaction, where
-- default_transaction_read_only has no effect.
--
-- The app signs JWTs with this role when SUPABASE_JWT_ROLE=claude_readonly (see lib/jwt.ts).
CREATE ROLE claude_readonly;

GRANT claude_readonly TO authenticator;

GRANT authenticated TO claude_readonly;

ALTER ROLE claude_readonly
SET
	transaction_read_only = 'on';
