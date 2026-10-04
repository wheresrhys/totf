import {
	BoxyList,
	SecondaryHeading
} from '@/app/components/shared/DesignSystem';
import {
	type CombinedHighlight,
	type HighlightCategory
} from '@/app/lib/highlights/types';
import type { SessionTabParams } from './session-tab-config';

// A v2 highlight carries its own printer, so every v2-backed section renders
// identically — only the highlights they're handed differ. Shared by this tab
// and `SummaryTotalsSection`, both of which render live `CombinedHighlight`s
// fetched in the browser.
export function renderCombinedHighlights(highlights: CombinedHighlight[]) {
	return highlights.map((highlight: CombinedHighlight) => (
		<li key={`${highlight.descriptor.type}-${highlight.species}`}>
			{highlight.formatters.combinedHighlightPrinter(highlight)}
		</li>
	));
}

function HighlightsSection({
	heading,
	testId,
	highlights
}: {
	heading: string;
	testId: string;
	highlights: CombinedHighlight[];
}) {
	if (highlights.length === 0) return null;
	return (
		<>
			<SecondaryHeading>{heading}</SecondaryHeading>
			<BoxyList testId={testId}>
				{renderCombinedHighlights(highlights)}
			</BoxyList>
		</>
	);
}

/**
 * The Highlights tab's `TabComponent`. The Rarities/Counts/Vital-stats
 * subsections come from the tab's own `dataFetcher` (`fetchSessionHighlights`),
 * which `TabContent` runs on mount — the tab is `clientSideOnly`, so these are
 * always generated in the browser, deep link or not. "Best of the session" is
 * plain page data, handed over in `params` and rendered whatever the fetch did.
 */
export function SessionHighlights({
	params: { oldestEncounter },
	data
}: {
	params: SessionTabParams;
	data: CombinedHighlight[] | null;
}) {
	const highlights = data ?? [];
	const inCategory = (category: HighlightCategory) =>
		highlights.filter(
			(highlight) => highlight.descriptor.category === category
		);

	const showBestOfSession =
		oldestEncounter !== null && oldestEncounter.bird.proven_age > 0;
	// All-or-nothing hide behaviour, evaluated per-subsection.
	if (highlights.length === 0 && !showBestOfSession) {
		return null;
	}
	return (
		<section data-testid="session-highlights">
			<HighlightsSection
				heading="Rarities"
				testId="rarities"
				highlights={inCategory('rarity')}
			/>
			<HighlightsSection
				heading="Counts"
				testId="counts"
				highlights={inCategory('count')}
			/>
			<HighlightsSection
				heading="Vital stats"
				testId="vital-stats"
				highlights={inCategory('biometrics')}
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
