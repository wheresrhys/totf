'use client';
import { useState, useEffect } from 'react';
import {
	BoxyList,
	SecondaryHeading
} from '@/app/components/shared/DesignSystem';
import { getCondensedHighlightsAtTimePeriod } from '@/app/lib/highlights/v2';

import { type CombinedHighlight } from '@/app/lib/highlights/v2/types';
import type { SessionEncounter } from '@/app/models/session';

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
	const [highlights, setHighlights] = useState<CombinedHighlight[]>([]);
	const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
		'loading'
	);
	useEffect(() => {
		setStatus('loading');

		getCondensedHighlightsAtTimePeriod(viewedGroupId, date, 'day')
			.then((highlights) => {
				setHighlights(highlights);
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

	const rarityHighlights = highlights.filter(
		(highlight) => highlight.descriptor.category === 'rarity'
	);
	const countHighlights = highlights.filter(
		(highlight) => highlight.descriptor.category === 'count'
	);
	const biometricsHighlights = highlights.filter(
		(highlight) => highlight.descriptor.category === 'biometrics'
	);

	const showRarities = rarityHighlights.length > 0;
	const showCounts = countHighlights.length > 0;
	const showBiometricsStats = biometricsHighlights.length > 0;
	const showBestOfSession =
		oldestEncounter !== null && oldestEncounter.bird.proven_age > 0;
	// All-or-nothing hide behaviour, now evaluated per-subsection.
	if (
		!showRarities &&
		!showCounts &&
		!showBiometricsStats &&
		!showBestOfSession
	) {
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
			{showBiometricsStats ? (
				<>
					<SecondaryHeading>Vital stats</SecondaryHeading>
					<BoxyList testId="vital-stats">
						{renderCombinedHighlights(biometricsHighlights)}
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
