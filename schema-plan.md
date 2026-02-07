Edit your organized ./schema/*.sql files.

Spin up a temporary "shadow" database (Supabase provides this via supabase start or a local Docker Postgres).

Apply your concatenated files to the shadow DB.

Diff your shadow DB against your local "migration state" using the Supabase CLI: supabase db diff --local > ./supabase/migrations/<timestamp>_sync_schema.sql

Review the generated migration.

Apply to production.
