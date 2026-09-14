#!/bin/sh
set -e

# Diff-aware gate for the snapshot-fixture-freshness DB integration test
# (supabase/__tests__/snapshot-fixture-freshness.test.ts, issue #893).
#
# The check needs a local Supabase seeded by `npm run db:seed:e2e`, so it can only
# ever run locally — CI has no Supabase service. Running it on every push would make
# every branch pay for a full fixture regeneration, so (mirroring
# scripts/e2e-select-suite.sh) it only runs when the branch's diff touches something
# that can plausibly change what the generator produces.

CHANGED=$(git diff --name-only origin/main...HEAD)

# Any branch that changes an RPC's return shape touches at least the first two.
# The rest are the check's own inputs: the generator, its fixture metadata, the
# committed fixtures themselves, and the test.
TRIGGER_PATHS="supabase/schema/
types/supabase.types.ts
scripts/generate-snapshots.ts
lib/snapshot-fixtures.ts
test-fixtures/snapshots/
supabase/__tests__/snapshot-fixture-freshness.test.ts"

MATCHED=false
while IFS= read -r path; do
	[ -z "$path" ] && continue
	if echo "$CHANGED" | grep -qF "$path"; then
		MATCHED=true
		break
	fi
done <<EOF
$TRIGGER_PATHS
EOF

if [ "$MATCHED" = true ]; then
	echo "fixture-freshness-select: diff touches a fixture-freshness trigger path — running test:fixture-freshness"
	echo "fixture-freshness-select: (needs local Supabase running and seeded — npm run db:start:local && npm run db:seed:e2e)"
	exec npm run test:fixture-freshness
else
	echo "fixture-freshness-select: diff doesn't touch any fixture-freshness trigger path — skipping"
fi
