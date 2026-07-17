import { RECORD_SCOPES } from '@/app/models/session-highlights';

// Scopes ranked broadest-first (all-time = 0). Shared by the narrower-scope
// removal rule and the scope-ordering rule.
export const SCOPE_BREADTH_RANK = new Map(
	RECORD_SCOPES.map((scope, index) => [scope, index])
);
