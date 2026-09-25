'use client';
import { useState, useEffect } from 'react';
import {
	BoxyList,
	SecondaryHeading
} from '@/app/components/shared/DesignSystem';
import { fetchSessionHighlights } from '@/app/actions/session-highlights';

import { getCondensedHighlightsAtTimePeriod } from '@/app/lib/highlights/v2';

import { type CombinedHighlight } from '@/app/lib/highlights/v2/types';
import {
	renderVitalStatHighlight,
	VITAL_STAT_HIGHLIGHT_RENDERERS
} from '@/app/components/highlights';
import type {
	SessionHighlight,
	VitalStatHighlight
} from '@/app/lib/highlights';
import type { SessionEncounter } from '@/app/models/session';

type HighlightsData = {
	v1: SessionHighlight[];
	v2: CombinedHighlight[];
};
// Each group's own renderer map (from the barrel) is the single source of
// truth for which highlight `type`s belong to that group — reusing its keys
// here means this partitioning can never drift out of sync with the map
// itself. long-absence-retrap intentionally matches none of the sections: it's
// a sibling of the groups, not wired into any section yet (see
// docs/session-highlight-ordering.md).
//
// Vital stats is the only section still partitioned this way. Rarities (#990)
// and Counts (#989) come from the v2 pipeline, where a highlight's own
// descriptor.category names its section and its own printer formats the line.
const VITAL_STAT_TYPES = new Set<string>(
	Object.keys(VITAL_STAT_HIGHLIGHT_RENDERERS)
);

function isVitalStatHighlight(
	highlight: SessionHighlight
): highlight is VitalStatHighlight {
	return VITAL_STAT_TYPES.has(highlight.type);
}

// A v2 highlight carries its own printer, so both v2-backed sections render
// identically — only the highlights they're handed differ.
function renderCombinedHighlights(highlights: CombinedHighlight[]) {
	return highlights.map((highlight: CombinedHighlight) => (
		<li key={`${highlight.descriptor.type}-${highlight.species}`}>
			{highlight.formatters.combinedHighlightPrinter(highlight)}
		</li>
	));
}

export function SessionHighlights({
	date,
	viewedGroupId,
	oldestEncounter
}: {
	date: string;
	viewedGroupId: number;
	oldestEncounter: SessionEncounter | null;
}) {
	// The Rarities/Counts/Vital-stats subsections are the highlight-machine
	// pool, fetched async; the action returns plain highlight data and the
	// client partitions + renders each group here. The "Best of the session"
	// subsection is plain prop data, available synchronously.
	const [highlights, setHighlights] = useState<HighlightsData>({
		v1: [],
		v2: []
	});
	const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
		'loading'
	);
	useEffect(() => {
		setStatus('loading');

		Promise.all([
			getCondensedHighlightsAtTimePeriod(viewedGroupId, date, 'day'),
			fetchSessionHighlights({ date, viewedGroupId })
		])
			.then(([fetchedV2, fetchedV1]) => {
				setHighlights({
					v1: fetchedV1,
					v2: fetchedV2
				});
				setStatus('loaded');
			})
			.catch((error) => {
				console.error('Failed to fetch session highlights', {
					date,
					viewedGroupId,
					error
				});
				setHighlights({ v1: [], v2: [] });
				setStatus('error');
			});
	}, [date, viewedGroupId]);
	if (status === 'loading') {
		return (
			<div className="flex items-center justify-center">
				<div className="loading loading-spinner loading-xl"></div>
			</div>
		);
	}
	// A failed fetch hides the whole tab, exactly as it did before this was split
	// into subsections — we don't surface a half-loaded "Best of the session" on
	// top of an errored fetch.
	if (status === 'error') return null;

	const rarityHighlights = highlights.v2.filter(
		(highlight) => highlight.descriptor.category === 'rarity'
	);
	const countHighlights = highlights.v2.filter(
		(highlight) => highlight.descriptor.category === 'count'
	);
	const vitalStatHighlights = highlights.v1.filter(isVitalStatHighlight);

	const showRarities = rarityHighlights.length > 0;
	const showCounts = countHighlights.length > 0;
	const showVitalStats = vitalStatHighlights.length > 0;
	const showBestOfSession =
		oldestEncounter !== null && oldestEncounter.bird.proven_age > 0;
	// All-or-nothing hide behaviour, now evaluated per-subsection.
	if (!showRarities && !showCounts && !showVitalStats && !showBestOfSession) {
		return null;
	}
	return (
		<section data-testid="session-highlights">
			{showRarities ? (
				<>
					<SecondaryHeading>Rarities</SecondaryHeading>
					<BoxyList testId="rarities">
						{renderCombinedHighlights(rarityHighlights)}
					</BoxyList>
				</>
			) : null}
			{showCounts ? (
				<>
					<SecondaryHeading>Counts</SecondaryHeading>
					<BoxyList testId="counts">
						{renderCombinedHighlights(countHighlights)}
					</BoxyList>
				</>
			) : null}
			{showVitalStats ? (
				<>
					<SecondaryHeading>Vital stats</SecondaryHeading>
					<BoxyList testId="vital-stats">
						{vitalStatHighlights.map(renderVitalStatHighlight)}
					</BoxyList>
				</>
			) : null}
			{showBestOfSession && oldestEncounter ? (
				<>
					<SecondaryHeading>Best of the session</SecondaryHeading>
					<BoxyList testId="best-of-session">
						<li>
							Oldest: {oldestEncounter.bird.proven_age} years —{' '}
							{oldestEncounter.bird.species.species_name} (
							{oldestEncounter.bird.ring_no})
						</li>
					</BoxyList>
				</>
			) : null}
		</section>
	);
}
