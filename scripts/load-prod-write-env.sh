#!/bin/bash

# Load prod environment variables in WRITE mode. Human-only escape hatch —
# used by db:import:prod and set-group-password:prod. Unlike load-prod-env.sh,
# SUPABASE_JWT_ROLE is left unset so JWTs are signed as 'authenticated':
# writes are permitted, still scoped to the target group by RLS.

echo "⚠⚠⚠  PROD WRITE MODE — commands can modify production data  ⚠⚠⚠"

# Verify 1Password CLI is installed and authenticated
if ! command -v op &> /dev/null; then
    echo "Error: 1Password CLI (op) is not installed"
    echo "Install it from: https://developer.1password.com/docs/cli/get-started/#install"
    exit 1
fi

# Check if user is signed in
if ! op whoami > /dev/null 2>&1; then
    echo "Error: Not signed in to 1Password CLI"
    echo "Run: op signin"
    exit 1
fi

# Export the environment variables using op run
echo "Injecting secrets from vault TOTF..."
exec op run --env-file=".env.1password" -- "$@"
