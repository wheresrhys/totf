'use client';
import { useState, useEffect } from 'react';
import {
	BoxyList,
	SecondaryHeading
} from '@/app/components/shared/DesignSystem';
import { fetchSessionHighlights } from '@/app/actions/session-highlights';
import {
	renderRarityHighlight,
	RARITY_HIGHLIGHT_RENDERERS,
	renderCountHighlight,
	COUNT_HIGHLIGHT_RENDERERS,
	renderVitalStatHighlight,
	VITAL_STAT_HIGHLIGHT_RENDERERS
} from '@/app/components/highlights';
import type {
	CountHighlight,
	RarityHighlight,
	SessionHighlight,
	VitalStatHighlight
} from '@/app/models/highlights';
import type { SessionEncounter } from '@/app/models/session';

// Each group's own renderer map (from the barrel) is the single source of
// truth for which highlight `type`s belong to that group — reusing its keys
// here means this partitioning can never drift out of sync with the map
// itself. long-absence-retrap intentionally matches none of the three: it's
// a sibling of the groups, not wired into any section yet (see
// docs/session-highlight-ordering.md).
const RARITY_TYPES = new Set<string>(Object.keys(RARITY_HIGHLIGHT_RENDERERS));
const COUNT_TYPES = new Set<string>(Object.keys(COUNT_HIGHLIGHT_RENDERERS));
const VITAL_STAT_TYPES = new Set<string>(
	Object.keys(VITAL_STAT_HIGHLIGHT_RENDERERS)
);

function isRarityHighlight(
	highlight: SessionHighlight
): highlight is RarityHighlight {
	return RARITY_TYPES.has(highlight.type);
}
function isCountHighlight(
	highlight: SessionHighlight
): highlight is CountHighlight {
	return COUNT_TYPES.has(highlight.type);
}
function isVitalStatHighlight(
	highlight: SessionHighlight
): highlight is VitalStatHighlight {
	return VITAL_STAT_TYPES.has(highlight.type);
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
	const [highlights, setHighlights] = useState<SessionHighlight[]>([]);
	const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
		'loading'
	);
	useEffect(() => {
		setStatus('loading');
		fetchSessionHighlights({ date, viewedGroupId })
			.then((fetched) => {
				setHighlights(fetched);
				setStatus('loaded');
			})
			.catch((error) => {
				console.error('Failed to fetch session highlights', {
					date,
					viewedGroupId,
					error
				});
				setHighlights([]);
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

	const rarityHighlights = highlights.filter(isRarityHighlight);
	const countHighlights = highlights.filter(isCountHighlight);
	const vitalStatHighlights = highlights.filter(isVitalStatHighlight);

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
						{rarityHighlights.map(renderRarityHighlight)}
					</BoxyList>
				</>
			) : null}
			{showCounts ? (
				<>
					<SecondaryHeading>Counts</SecondaryHeading>
					<BoxyList testId="counts">
						{countHighlights.map(renderCountHighlight)}
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
