import {
	combinedSortValue,
	type CombinedSessionTotalRecordHighlight,
	type SessionHighlight,
	type SessionTotalRecordHighlight
} from '@/app/models/session-highlights';

// Comb-1: a session holding both the busiest (encounters) and most-varied
// (species) session-total record over the *same* scope has them merged into one
// "Busiest and most varied session" line. Different scopes stay separate. The
// combined item takes the list position of the encounters record.
export function combineSessionTotalRecords(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	const recordsByScope = new Map<
		string,
		{
			encounters?: SessionTotalRecordHighlight;
			species?: SessionTotalRecordHighlight;
		}
	>();
	for (const highlight of highlights) {
		if (highlight.type !== 'session-total-record') continue;
		const forScope = recordsByScope.get(highlight.scope) ?? {};
		forScope[highlight.metric] = highlight;
		recordsByScope.set(highlight.scope, forScope);
	}
	// Scopes holding both a busiest and a most-varied record — the pair merges
	const combinableScopes = new Set(
		[...recordsByScope]
			.filter(([, pair]) => pair.encounters && pair.species)
			.map(([scope]) => scope)
	);
	const result: SessionHighlight[] = [];
	for (const highlight of highlights) {
		if (
			highlight.type === 'session-total-record' &&
			combinableScopes.has(highlight.scope)
		) {
			// Emit the combined item in place of the busiest record; drop the
			// most-varied record wherever it sits
			if (highlight.metric === 'species') continue;
			const species = recordsByScope.get(highlight.scope)!.species!;
			const combined: CombinedSessionTotalRecordHighlight = {
				type: 'combined-session-total-record',
				sortValue: combinedSortValue([highlight, species]),
				scope: highlight.scope,
				encounterValue: highlight.value,
				speciesValue: species.value,
				year: highlight.year,
				isCurrentYear: highlight.isCurrentYear
			};
			result.push(combined);
			continue;
		}
		result.push(highlight);
	}
	return result;
}
