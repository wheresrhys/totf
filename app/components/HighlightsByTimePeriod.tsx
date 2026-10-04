'use client';

import { SecondaryHeading } from '@/app/components/shared/DesignSystem';
import {
	HighlightValue,
	isNumericHighlightValue,
	type HighlightsOfType
} from '@/app/lib/highlights/types';
import type { ViewedGroup } from '@/app/lib/group-slug';
import {
	StatOutput,
	type SpeciesName
} from '@/app/components/shared/StatOutput';

// Split out of `SummaryTotalsSection.tsx` (#1072) so `SummaryHighlightsTab.tsx`
// (one of summary's 4 extracted tabs) can import it without creating a
// circular dependency — `SummaryTotalsSection.tsx` itself imports
// `summaryHighlightsTab` from that file. `SummaryTotalsSection.tsx`
// re-exports this under its original name so its other two existing
// consumers (`SquashedMonthSummaryTotalsSection.tsx`,
// `app/components/pages/species/SpHighlightsTab.tsx`) keep working unchanged.

function showHighlightUnit(
	highlight: HighlightsOfType,
	highlightValue: HighlightValue,
	excludeSpeciesName?: boolean
) {
	if (['g', 'mm'].includes(highlight.descriptor.unit)) {
		return true;
	}
	return !excludeSpeciesName;
}

function getHighlightUnit(
	highlight: HighlightsOfType,
	highlightValue: HighlightValue,
	excludeSpeciesName?: boolean
) {
	if (['g', 'mm'].includes(highlight.descriptor.unit)) {
		return highlight.descriptor.unit;
	}
	return excludeSpeciesName
		? undefined
		: (highlightValue.species as SpeciesName) || highlight.descriptor.unit;
}

export function HighlightsByTimePeriod({
	highlights,
	heading,
	viewedGroup,
	excludeSpeciesName
}: {
	highlights: HighlightsOfType[];
	heading: string;
	viewedGroup?: ViewedGroup;
	excludeSpeciesName?: boolean;
}) {
	if (!highlights.length) return null;
	return (
		<div>
			<SecondaryHeading>{heading}</SecondaryHeading>
			{highlights.map(
				(highlight) =>
					isNumericHighlightValue(highlight.values[0]) && (
						<div
							key={`${highlight.descriptor.type}-${highlight.scope.temporalUnit}`}
						>
							{highlight.formatters.highlightListPrefixPrinter(highlight)}:{' '}
							<div className="flex gap-2">
								{highlight.values.map(
									(highlightValue) =>
										isNumericHighlightValue(highlightValue) && (
											<span
												className="badge badge-outline"
												key={highlightValue.timePeriod}
											>
												<StatOutput
													dateFormat={
														highlight.scope.temporalUnit === 'day'
															? 'dd/MM/yy'
															: 'MMM yyyy'
													}
													visitDate={highlightValue.timePeriod}
													temporalUnit={highlight.scope.temporalUnit}
													showUnit={showHighlightUnit(
														highlight,
														highlightValue,
														excludeSpeciesName
													)}
													value={highlightValue.value}
													unit={getHighlightUnit(
														highlight,
														highlightValue,
														excludeSpeciesName
													)}
													viewedGroup={viewedGroup}
												/>
											</span>
										)
								)}
							</div>
						</div>
					)
			)}
		</div>
	);
}
