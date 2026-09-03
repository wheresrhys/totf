'use client';
import { useState, useEffect } from 'react';
import {
	BoxyList,
	SecondaryHeading
} from '@/app/components/shared/DesignSystem';
import { fetchSessionHighlights } from '@/app/actions/session-highlights';
import { renderHighlight } from '@/app/components/session-highlight-renderers';
import type { SessionHighlight } from '@/app/models/session-highlights';
import type { SessionEncounter } from '@/app/models/session';

export function SessionHighlights({
	date,
	viewedGroupId,
	oldestEncounter
}: {
	date: string;
	viewedGroupId: number;
	oldestEncounter: SessionEncounter | null;
}) {
	// The "Standouts" subsection is the highlight-machine pool, fetched async; the
	// action returns plain highlight data and the client renders each here. The
	// "Best of the session" subsection is plain prop data, available synchronously.
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
	// top of a Standouts error.
	if (status === 'error') return null;

	const showStandouts = highlights.length > 0;
	const showBestOfSession =
		oldestEncounter !== null && oldestEncounter.bird.proven_age > 0;
	// All-or-nothing hide behaviour, now evaluated per-subsection.
	if (!showStandouts && !showBestOfSession) return null;
	return (
		<section data-testid="session-highlights">
			{showStandouts ? (
				<>
					<SecondaryHeading>Standouts</SecondaryHeading>
					<BoxyList testId="standouts">
						{highlights.map(renderHighlight)}
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
