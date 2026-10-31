import {
	BoxyList,
	SecondaryHeading
} from '@/app/components/shared/DesignSystem';
import {
	type CombinedHighlight,
	type HighlightCategory
} from '@/modules/highlights/types';
import { ReportHighlightButton } from '@/app/components/ReportHighlightButton';
import type { SessionTabParams } from './session-tab-config';

// A v2 highlight carries its own printer, so every v2-backed section renders
// identically — only the highlights they're handed differ. Shared by this tab
// and `SummaryTotalsSection`, both of which render live `CombinedHighlight`s
// fetched in the browser. `canReport` (#1122) shows a "Report" button per
// highlight, gated server-side (production + a qa cookie) by the caller.
export function renderCombinedHighlights(
	highlights: CombinedHighlight[],
	canReport: boolean
) {
	return highlights.map((highlight: CombinedHighlight) => {
		const displayedText =
			highlight.formatters.combinedHighlightPrinter(highlight);
		return (
			<li
				key={`${highlight.descriptor.type}-${highlight.species}`}
				title={JSON.stringify(highlight, null, 2)}
			>
				{displayedText}
				{canReport && (
					<ReportHighlightButton
						highlight={highlight}
						displayedText={displayedText}
					/>
				)}
			</li>
		);
	});
}

function HighlightsSection({
	heading,
	testId,
	highlights,
	canReport
}: {
	heading: string;
	testId: string;
	highlights: CombinedHighlight[];
	canReport: boolean;
}) {
	if (highlights.length === 0) return null;
	return (
		<>
			<SecondaryHeading>{heading}</SecondaryHeading>
			<BoxyList testId={testId}>
				{renderCombinedHighlights(highlights, canReport)}
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
	params: { oldestEncounter, canReportHighlights },
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
				canReport={canReportHighlights}
			/>
			<HighlightsSection
				heading="Counts"
				testId="counts"
				highlights={inCategory('count')}
				canReport={canReportHighlights}
			/>
			<HighlightsSection
				heading="Vital stats"
				testId="vital-stats"
				highlights={inCategory('biometrics')}
				canReport={canReportHighlights}
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
