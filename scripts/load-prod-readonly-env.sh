#!/bin/bash

# Load prod environment variables in READ-ONLY mode, for safe debugging against
# production data (e.g. by Claude Code). Differences from load-prod-env.sh:
#  - omits SUPABASE_SERVICE_ROLE_KEY (the RLS-bypass key) from the environment
#  - signs group JWTs with the claude_readonly role (SUPABASE_JWT_ROLE), so
#    Postgres rejects every write with error 25006

export SUPABASE_JWT_ROLE=claude_readonly

echo "Loading READ-ONLY environment variables from 1Password vault TOTF..."

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
echo "Injecting secrets from vault TOTF (read-only mode)..."
exec op run --env-file=".env.1password.readonly" -- "$@"
