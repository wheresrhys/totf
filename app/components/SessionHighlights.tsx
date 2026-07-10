'use client';
import { useState, useEffect } from 'react';
import {
	BoxyList,
	SecondaryHeading
} from '@/app/components/shared/DesignSystem';
import { fetchSessionHighlights } from '@/app/actions/session-highlights';
import {
	buildHighlightSentence,
	type SessionHighlight
} from '@/app/models/session-highlights';

export function SessionHighlights({
	date,
	viewedGroupId
}: {
	date: string;
	viewedGroupId: number;
}) {
	const [highlights, setHighlights] = useState<SessionHighlight[]>([]);
	const [isLoaded, setIsLoaded] = useState(false);
	useEffect(() => {
		fetchSessionHighlights({ date, viewedGroupId })
			.then(setHighlights)
			.catch((error) => {
				console.error('Failed to fetch session highlights', {
					date,
					viewedGroupId,
					error
				});
				setHighlights([]);
			})
			.then(() => setIsLoaded(true));
	}, [date, viewedGroupId]);
	if (!isLoaded) {
		return (
			<div className="flex items-center justify-center">
				<div className="loading loading-spinner loading-xl"></div>
			</div>
		);
	}
	if (highlights.length === 0) return null;
	return (
		<section data-testid="session-highlights">
			<SecondaryHeading>Highlights</SecondaryHeading>
			<BoxyList>
				{highlights.map((highlight) => {
					const sentence = buildHighlightSentence(highlight);
					return <li key={sentence}>{sentence}</li>;
				})}
			</BoxyList>
		</section>
	);
}
