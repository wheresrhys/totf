// Broadest first — a record is reported at the broadest scope it holds
export const RECORD_SCOPES = ['all-time', 'this-year'] as const;
export type RecordScope = (typeof RECORD_SCOPES)[number];

// Scopes ranked broadest-first (all-time = 0). Used by the narrower-scope
// removal rule and by each group's own local block-ordering key.
export const SCOPE_BREADTH_RANK = new Map(
	RECORD_SCOPES.map((scope, index) => [scope, index])
);

export function getScopeMatcher(
	scope: RecordScope,
	sessionDate: Date
): (date: string) => boolean {
	switch (scope) {
		case 'all-time':
			return () => true;
		case 'this-year': {
			const yearPrefix = `${sessionDate.getFullYear()}-`;
			return (date) => date.startsWith(yearPrefix);
		}
	}
}
