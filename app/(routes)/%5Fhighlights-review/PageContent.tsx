'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { noCase } from 'change-case';
import { TemporalFilterControls } from '@/app/components/shared/TemporalFilterControls';
import {
	buildTemporalHref,
	buildTemporalQueryStrings,
	computeEffectiveDateRange,
	type TemporalSelection
} from '@/app/lib/temporal-filter';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
import { getCombinedHighlightsOfTypeAcrossScopes } from '@/app/lib/highlights/lib/hg2';
import { ruleTypes } from '@/app/lib/highlights/rules';
import type { CombinedHighlight } from '@/app/lib/highlights/types';
import { renderCombinedHighlights } from '@/app/components/pages/session/SessionHighlights';
import {
	PageWrapper,
	PrimaryHeading,
	SecondaryHeading,
	Standfirst,
	BoxyList
} from '@/app/components/shared/DesignSystem';
import {
	enumerateReviewPeriods,
	hasUsableWindow,
	isEmptySelection,
	type ReviewPeriod,
	type UsableWindow
} from '@/app/components/pages/highlights-review/period-enumeration';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { HighlightsReviewParams, HighlightsReviewPageData } from './page';

const REVIEW_PAGE_PATH = '/_highlights-review';
const TEMPORAL_UNITS: readonly TemporalUnit[] = ['day', 'month', 'year'];

type PeriodHighlights = ReviewPeriod & {
	intra: CombinedHighlight[];
	inter: CombinedHighlight[];
};

type ResolvedWindow =
	| { kind: 'no-data' }
	| { kind: 'invalid' }
	| {
			kind: 'usable';
			window: UsableWindow;
			temporalUnit: TemporalUnit;
			usingYearsDefault: boolean;
	  };

// Nothing picked at all defaults to one year-granularity period per year the
// group has data for, ignoring whatever the temporal-unit dropdown shows —
// iterating day-by-day across a group's entire history is exactly the
// unbounded case this page needs to avoid. A window that *was* picked but
// doesn't resolve to usable bounds (a one-sided date, or a genuine conflict)
// is a different case — the user picked something that doesn't work, so this
// stays 'invalid' rather than silently falling back to the same default.
function resolveActiveWindow(
	selection: TemporalSelection,
	years: number[],
	temporalUnit: TemporalUnit
): ResolvedWindow {
	if (isEmptySelection(selection)) {
		if (years.length === 0) {
			return { kind: 'no-data' };
		}
		const minYear = Math.min(...years);
		const maxYear = Math.max(...years);
		return {
			kind: 'usable',
			window: { fromDate: `${minYear}-01-01`, toDate: `${maxYear}-12-31` },
			temporalUnit: 'year',
			usingYearsDefault: true
		};
	}
	const effectiveDateRange = computeEffectiveDateRange(selection);
	if (!hasUsableWindow(effectiveDateRange)) {
		return { kind: 'invalid' };
	}
	return {
		kind: 'usable',
		window: effectiveDateRange,
		temporalUnit,
		usingYearsDefault: false
	};
}

export function HighlightsReviewPageContent({
	params: { selection, temporalUnit, highlightType },
	data: { years },
	viewedGroup
}: {
	params: HighlightsReviewParams;
	data: HighlightsReviewPageData;
	viewedGroup: ViewedGroup;
}) {
	const router = useRouter();
	const [periods, setPeriods] = useState<PeriodHighlights[] | null>(null);
	const resolved = resolveActiveWindow(selection, years, temporalUnit);

	// `resolved` is a fresh object every render — depend on the primitives it's
	// derived from (below) rather than on `resolved` itself.
	const activeFromDate =
		resolved.kind === 'usable' ? resolved.window.fromDate : undefined;
	const activeToDate =
		resolved.kind === 'usable' ? resolved.window.toDate : undefined;
	const activeRecurringMonth =
		resolved.kind === 'usable' ? resolved.window.recurringMonth : undefined;
	const activeTemporalUnit =
		resolved.kind === 'usable' ? resolved.temporalUnit : undefined;

	useEffect(() => {
		if (resolved.kind !== 'usable') {
			setPeriods(null);
			return;
		}
		let cancelled = false;
		setPeriods(null);
		const reviewPeriods = enumerateReviewPeriods(
			resolved.window,
			resolved.temporalUnit
		);
		Promise.all(
			reviewPeriods.map(async (period): Promise<PeriodHighlights> => {
				const [intra, inter] = await Promise.all([
					getCombinedHighlightsOfTypeAcrossScopes({
						timePeriod: period.timePeriod,
						temporalUnit: resolved.temporalUnit,
						viewedGroup,
						outlook: 'intra',
						highlightType
					}),
					getCombinedHighlightsOfTypeAcrossScopes({
						timePeriod: period.timePeriod,
						temporalUnit: resolved.temporalUnit,
						viewedGroup,
						outlook: 'inter',
						highlightType
					})
				]);
				return { ...period, intra, inter };
			})
		).then((results) => {
			if (!cancelled) setPeriods(results);
		});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		resolved.kind,
		activeFromDate,
		activeToDate,
		activeRecurringMonth,
		activeTemporalUnit,
		highlightType,
		viewedGroup.id
	]);

	function pushSelection(change: {
		temporalUnit?: TemporalUnit;
		highlightType?: string;
		selection?: TemporalSelection;
	}) {
		router.push(
			buildTemporalHref(REVIEW_PAGE_PATH, {
				...buildTemporalQueryStrings(change.selection ?? selection),
				temporalUnit: change.temporalUnit ?? temporalUnit,
				highlightType: change.highlightType ?? highlightType
			})
		);
	}

	const isLoading = resolved.kind === 'usable' && periods === null;
	const visiblePeriods = (periods ?? []).filter(
		(period) => period.intra.length > 0 || period.inter.length > 0
	);

	return (
		<PageWrapper>
			<Standfirst>
				Pick a window, a granularity to iterate within it, and a highlight type,
				to sanity-check what the highlights pipeline generates per period.
			</Standfirst>
			<div className="flex gap-2 flex-wrap items-center justify-end">
				<TemporalFilterControls
					years={years}
					baseUrl={REVIEW_PAGE_PATH}
					initialSelection={selection}
					navigationController={(nextSelection) => ({
						path: REVIEW_PAGE_PATH,
						queryStrings: {
							...buildTemporalQueryStrings(nextSelection),
							temporalUnit,
							highlightType
						}
					})}
				/>
				<div className="flex items-center gap-2">
					<label htmlFor="review-temporal-unit-select" className="shrink-0">
						Temporal unit
					</label>
					<select
						id="review-temporal-unit-select"
						className="select max-w-sm appearance-none"
						value={temporalUnit}
						onChange={(event) =>
							pushSelection({
								temporalUnit: event.target.value as TemporalUnit
							})
						}
					>
						{TEMPORAL_UNITS.map((unit) => (
							<option key={unit} value={unit}>
								{unit}
							</option>
						))}
					</select>
				</div>
				<div className="flex items-center gap-2">
					<label htmlFor="review-highlight-type-select" className="shrink-0">
						Highlight type
					</label>
					<select
						id="review-highlight-type-select"
						className="select max-w-sm appearance-none"
						value={highlightType}
						onChange={(event) =>
							pushSelection({ highlightType: event.target.value })
						}
					>
						{ruleTypes.map((type) => (
							<option key={type} value={type}>
								{noCase(type)}
							</option>
						))}
					</select>
				</div>
			</div>
			{resolved.kind === 'no-data' ? (
				<p data-testid="highlights-review-no-data">
					This group has no sessions yet.
				</p>
			) : resolved.kind === 'invalid' ? (
				<p role="alert" data-testid="highlights-review-invalid">
					Pick a valid window (a year, a month, or a from/to date range that
					resolves to real dates) to generate highlights for.
				</p>
			) : isLoading ? (
				<div
					className="flex items-center justify-center gap-2"
					data-testid="highlights-review-loading"
				>
					<div className="loading loading-spinner loading-xl"></div>
				</div>
			) : (
				<>
					{resolved.usingYearsDefault && (
						<Standfirst testId="highlights-review-years-default">
							No window selected — showing one period per year of data,
							regardless of the temporal unit above.
						</Standfirst>
					)}
					{visiblePeriods.length === 0 ? (
						<p data-testid="highlights-review-empty">
							No {noCase(highlightType)} highlights in this window.
						</p>
					) : (
						visiblePeriods.map((period) => (
							<section key={period.timePeriod}>
								<PrimaryHeading>{period.label}</PrimaryHeading>
								{period.intra.length > 0 && (
									<>
										<SecondaryHeading>Within</SecondaryHeading>
										<BoxyList testId={`within-${period.timePeriod}`}>
											{renderCombinedHighlights(period.intra, true)}
										</BoxyList>
									</>
								)}
								{period.inter.length > 0 && (
									<>
										<SecondaryHeading>Relative</SecondaryHeading>
										<BoxyList testId={`relative-${period.timePeriod}`}>
											{renderCombinedHighlights(period.inter, true)}
										</BoxyList>
									</>
								)}
							</section>
						))
					)}
				</>
			)}
		</PageWrapper>
	);
}
