'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
	MONTH_NAMES,
	buildTemporalHref,
	buildTemporalQueryStrings,
	computeEffectiveDateRange,
	type TemporalSelection
} from '@/app/lib/temporal-filter';

export type TemporalNavigationTarget = {
	path: string;
	queryStrings: Record<string, string>;
};

function describeEffectiveDateRange(selection: TemporalSelection): string {
	const { fromDate, toDate } = computeEffectiveDateRange(selection);
	// A month with no year has no contiguous bounds to show, so name it
	// explicitly rather than letting the range read as unfiltered.
	const recurringMonth =
		selection.month && !selection.year
			? ` (${MONTH_NAMES[selection.month - 1]} in every year)`
			: '';
	if (fromDate && toDate) {
		return `${fromDate} to ${toDate}${recurringMonth}`;
	}
	if (fromDate) {
		return `${fromDate} onwards${recurringMonth}`;
	}
	if (toDate) {
		return `up to ${toDate}${recurringMonth}`;
	}
	return `all dates${recurringMonth}`;
}

// Reusable year / month / date-range filter (#1051). The two filtering modes
// are never an either/or: whatever is set, the effective range shown is the
// intersection of the year/month-derived range with the explicit dates. Mixing
// the modes is allowed but flagged, since the two can easily fail to overlap.
export function TemporalFilterControls({
	years,
	baseUrl,
	initialSelection = {},
	navigationController
}: {
	years: number[];
	baseUrl: string;
	// Seeds the controls from the current URL, so a navigation driven by this
	// component doesn't render back with the controls reset.
	initialSelection?: TemporalSelection;
	// Lets a caller route part of the selection into path segments (e.g. the
	// summary page's `/summary/[year]/[month]`) while still expressing the
	// rest as query strings. Omitted: everything goes on `baseUrl` as query
	// strings.
	navigationController?: (
		selected: TemporalSelection
	) => TemporalNavigationTarget;
}) {
	const router = useRouter();
	const [selection, setSelection] =
		useState<TemporalSelection>(initialSelection);
	const [isWarningVisible, setIsWarningVisible] = useState(false);

	const hasYearOrMonth = !!(selection.year || selection.month);
	const hasDateRange = !!(selection.fromDate || selection.toDate);
	const hasConflict = hasYearOrMonth && hasDateRange;

	function applySelection(nextSelection: TemporalSelection) {
		setSelection(nextSelection);
		const { path, queryStrings } = navigationController
			? navigationController(nextSelection)
			: {
					path: baseUrl,
					queryStrings: buildTemporalQueryStrings(nextSelection)
				};
		router.push(buildTemporalHref(path, queryStrings));
	}

	function updateSelection(change: TemporalSelection) {
		applySelection({ ...selection, ...change });
	}

	function clearDateRange() {
		setIsWarningVisible(false);
		applySelection({ year: selection.year, month: selection.month });
	}

	function clearYearAndMonth() {
		setIsWarningVisible(false);
		applySelection({ fromDate: selection.fromDate, toDate: selection.toDate });
	}

	return (
		<form
			name="temporal-filter-controls"
			className="flex gap-2 flex-wrap items-center justify-end"
			onSubmit={(event) => event.preventDefault()}
		>
			<div className="flex items-center gap-2">
				<label htmlFor="temporal-year-select" className="shrink-0">
					Year
				</label>
				<select
					id="temporal-year-select"
					className="select max-w-sm appearance-none"
					value={selection.year ?? ''}
					onChange={(event) =>
						updateSelection({
							year: parseInt(event.target.value) || undefined
						})
					}
				>
					<option value="">All</option>
					{years.map((year) => (
						<option key={year} value={year}>
							{year}
						</option>
					))}
				</select>
			</div>
			<div className="flex items-center gap-2">
				<label htmlFor="temporal-month-select" className="shrink-0">
					Month
				</label>
				<select
					id="temporal-month-select"
					className="select max-w-sm appearance-none"
					value={selection.month ?? ''}
					onChange={(event) =>
						updateSelection({
							month: parseInt(event.target.value) || undefined
						})
					}
				>
					<option value="">All</option>
					{MONTH_NAMES.map((monthName, index) => (
						<option key={monthName} value={index + 1}>
							{monthName}
						</option>
					))}
				</select>
			</div>
			<div className="flex items-center gap-2">
				<label htmlFor="temporal-from-date-input" className="shrink-0">
					From date
				</label>
				<input
					id="temporal-from-date-input"
					type="date"
					className="input max-w-sm"
					value={selection.fromDate ?? ''}
					onChange={(event) =>
						updateSelection({ fromDate: event.target.value || undefined })
					}
				/>
			</div>
			<div className="flex items-center gap-2">
				<label htmlFor="temporal-to-date-input" className="shrink-0">
					To date
				</label>
				<input
					id="temporal-to-date-input"
					type="date"
					className="input max-w-sm"
					value={selection.toDate ?? ''}
					onChange={(event) =>
						updateSelection({ toDate: event.target.value || undefined })
					}
				/>
			</div>
			{hasConflict ? (
				// Click-toggled rather than hover-revealed (unlike
				// `SortableTable`'s info tooltips) because this one holds action
				// buttons — a hover-only panel disappears before it can be used.
				<div className={`tooltip ${isWarningVisible ? 'show' : ''}`}>
					<button
						type="button"
						className="tooltip-toggle"
						aria-label="Date filter conflict warning"
						onClick={() => setIsWarningVisible(!isWarningVisible)}
					>
						<span className="icon-[tabler--alert-triangle] size-4 text-error"></span>
					</button>
					{isWarningVisible ? (
						<span
							className="tooltip-content tooltip-shown:opacity-100 tooltip-shown:visible max-w-2xs flex"
							role="tooltip"
						>
							<span className="p-2 bg-white border rounded-sm border-solid border-inherit normal-case font-normal text-xs flex flex-col gap-2">
								<span>
									A year or month selection combined with an explicit date range
									may not line up — only dates falling inside both are shown.
								</span>
								<span className="flex gap-2">
									<button
										type="button"
										className="btn btn-xs"
										onClick={clearDateRange}
									>
										Clear date range
									</button>
									<button
										type="button"
										className="btn btn-xs"
										onClick={clearYearAndMonth}
									>
										Clear year/month
									</button>
								</span>
							</span>
						</span>
					) : null}
				</div>
			) : null}
			<p className="text-sm" data-testid="effective-date-range">
				Showing: {describeEffectiveDateRange(selection)}
			</p>
		</form>
	);
}
