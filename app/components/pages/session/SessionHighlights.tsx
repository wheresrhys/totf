import {
	BoxyList,
	SecondaryHeading
} from '@/app/components/shared/DesignSystem';
import { type CombinedHighlight } from '@/app/lib/highlights/types';
import type {
	SessionHighlightLine,
	SessionTabParams
} from './session-tab-config';

// A v2 highlight carries its own printer, so every v2-backed section renders
// identically — only the highlights they're handed differ. The session tab
// itself no longer goes through this (its sentences are printed in
// `fetchSessionHighlightLines`, server-side where possible, so the data can
// cross the server→client boundary); it stays exported here for
// `SummaryTotalsSection`, which renders live `CombinedHighlight`s.
export function renderCombinedHighlights(highlights: CombinedHighlight[]) {
	return highlights.map((highlight: CombinedHighlight) => (
		<li key={`${highlight.descriptor.type}-${highlight.species}`}>
			{highlight.formatters.combinedHighlightPrinter(highlight)}
		</li>
	));
}

function HighlightLinesSection({
	heading,
	testId,
	lines
}: {
	heading: string;
	testId: string;
	lines: SessionHighlightLine[];
}) {
	if (lines.length === 0) return null;
	return (
		<>
			<SecondaryHeading>{heading}</SecondaryHeading>
			<BoxyList testId={testId}>
				{lines.map((line) => (
					<li key={line.key}>{line.text}</li>
				))}
			</BoxyList>
		</>
	);
}

/**
 * The Highlights tab's `TabComponent`. The Rarities/Counts/Vital-stats
 * subsections come from the tab's own `dataFetcher`
 * (`fetchSessionHighlightLines`) — prefetched server-side when the page was
 * deep-linked with `?tabId=highlights`, fetched by `TabContent` on mount
 * otherwise. "Best of the session" is plain page data, handed over in `params`
 * and rendered whatever the fetch did.
 */
export function SessionHighlights({
	params: { oldestEncounter },
	data
}: {
	params: SessionTabParams;
	data: SessionHighlightLine[] | null;
}) {
	const highlightLines = data ?? [];
	const rarityLines = highlightLines.filter(
		(line) => line.category === 'rarity'
	);
	const countLines = highlightLines.filter((line) => line.category === 'count');
	const biometricsLines = highlightLines.filter(
		(line) => line.category === 'biometrics'
	);

	const showBestOfSession =
		oldestEncounter !== null && oldestEncounter.bird.proven_age > 0;
	// All-or-nothing hide behaviour, evaluated per-subsection.
	if (highlightLines.length === 0 && !showBestOfSession) {
		return null;
	}
	return (
		<section data-testid="session-highlights">
			<HighlightLinesSection
				heading="Rarities"
				testId="rarities"
				lines={rarityLines}
			/>
			<HighlightLinesSection
				heading="Counts"
				testId="counts"
				lines={countLines}
			/>
			<HighlightLinesSection
				heading="Vital stats"
				testId="vital-stats"
				lines={biometricsLines}
			/>
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
