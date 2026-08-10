#!/bin/sh
set -e

CHANGED=$(git diff --name-only origin/main...HEAD)

TRIGGER_PATHS=$(node --input-type=commonjs -e "console.log(require('./e2e/mutating-spec-triggers.json')['@mutates'].join('\n'))")

# Also treat direct (one-level) local import dependencies of the trigger
# files as trigger paths — see scripts/resolve-mutating-import-deps.mjs.
DEPENDENCY_PATHS=$(node scripts/resolve-mutating-import-deps.mjs)
TRIGGER_PATHS="$TRIGGER_PATHS
$DEPENDENCY_PATHS"

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
	echo "e2e-select-suite: diff touches an @mutates trigger path — running full test:e2e"
	exec npm run test:e2e
else
	echo "e2e-select-suite: diff doesn't touch any @mutates trigger path — running test:e2e:safe"
	exec npm run test:e2e:safe
fi
