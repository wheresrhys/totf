#!/bin/bash

# Load environment variables from 1Password vault
# This script uses op run to inject secrets from 1Password into the environment
# In CI environments, it skips 1Password CLI and runs commands directly

# Check if running in CI environment
if [ -n "$CI" ]; then
    echo "Running in CI environment - skipping 1Password CLI, using GitHub Action secrets..."
    exec "$@"
    exit 0
fi

# Default to read-only prod access: JWTs are signed with the app_readonly role,
# so Postgres rejects every write with error 25006 (see supabase/schema/cluster/roles.sql).
# Prod writes require the explicit load-prod-write-env.sh wrapper.
export SUPABASE_JWT_ROLE=app_readonly

echo "Loading environment variables from 1Password vault TOTF (read-only mode)..."

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
