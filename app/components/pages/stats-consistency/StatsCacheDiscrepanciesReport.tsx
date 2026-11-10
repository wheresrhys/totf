'use client';
import { useEffect, useState } from 'react';
import {
	AccordionItem,
	BoxyList,
	SecondaryHeading,
	Table
} from '@/modules/ui-kit';
import {
	fetchStatsCacheDiscrepancies,
	type FetchStatsCacheDiscrepanciesResult
} from '@/app/actions/stats-cache-discrepancies';
import type { StatsCacheDiscrepancy } from '@/modules/stats';
import {
	DISCREPANCY_SCOPES,
	EAGER_DISCREPANCY_SCOPES,
	isEagerScope,
	discrepancyScopeKey,
	discrepancyScopeHeading,
	discrepancyItemLabel,
	type DiscrepancyScope,
	type DiscrepancyScopeResults
} from './discrepancy-scopes';
import { DiscrepancyRowFixButtons } from './DiscrepancyRowFixButtons';
import {
	isDiscrepancyRowCoveredByFixDispatch,
	type DiscrepancyRowScope,
	type StatsCacheFixDispatch
} from './discrepancy-row-fix-scope';

/**
 * The fix-request state #1390 lifts above every row of the whole report —
 * deliberately not per scope section. A dispatch from a by-species row covers
 * the matching overall row too (and vice versa), and those two rows live in
 * different sections, so anything narrower than report-wide would leave half
 * the covered rows looking untouched.
 */
type FixRequestState = {
	dispatches: StatsCacheFixDispatch[];
	onFixRequested: (dispatch: StatsCacheFixDispatch) => void;
};

/** The three fields the fix buttons read, pulled off a scope + one of its discrepant cells — a cell's `null` period/species becomes an absent field. */
function discrepancyRowScope(
	scope: DiscrepancyScope,
	discrepancy: StatsCacheDiscrepancy
): DiscrepancyRowScope {
	const row: DiscrepancyRowScope = { temporalUnit: scope.temporalUnit };
	if (discrepancy.time_period !== null) {
		row.period = discrepancy.time_period;
	}
	if (discrepancy.species_id !== null) {
		row.speciesId = discrepancy.species_id;
	}
	return row;
}

type DiscrepancyItemModel = {
	label: string;
	discrepancy: StatsCacheDiscrepancy;
};

function DiscrepancyItemHeading({ model }: { model: DiscrepancyItemModel }) {
	return <span>{model.label}</span>;
}

function formatCellValue(
	row: Record<string, unknown> | null,
	field: string
): string {
	if (row === null) {
		return '—';
	}
	const value = row[field];
	return value === null || value === undefined ? '—' : String(value);
}

// Only the columns where the two displayed values actually differ are worth
// showing (per PR #1393 review) — a column where cached and live tally is
// dropped from this row's table entirely, rather than rendered unstyled.
// Comparing the *formatted* values (not the raw ones `mismatchedFields`
// diffs) also gives a sensible answer for a presence mismatch (one side
// `null`, `mismatchedFields` empty by construction — see
// `StatsCacheDiscrepancy`'s own doc comment): every field the present side
// actually has a value for differs from the other side's blank '—', so it
// stays; a field blank on both sides is dropped like any other tallying one.
function discrepancyFieldNames(discrepancy: StatsCacheDiscrepancy): string[] {
	const { cachedRow, liveRow } = discrepancy;
	const keys = new Set([
		...Object.keys(cachedRow ?? {}),
		...Object.keys(liveRow ?? {})
	]);
	keys.delete('species_id');
	keys.delete('time_period');
	return [...keys].filter(
		(field) =>
			formatCellValue(cachedRow, field) !== formatCellValue(liveRow, field)
	);
}

// One row for the cached value, one for the live-computed value — the
// mismatch style (this app's existing `text-error` anomaly convention, e.g.
// `TemporalFilterControls.tsx`/`TabContent.tsx`) applies only to a column
// `mismatchedFields` actually names, not to every column of a presence
// mismatch (whose `mismatchedFields` is empty by construction — see
// `StatsCacheDiscrepancy`'s own doc comment). The table itself wraps in
// `modules/ui-kit`'s `Table`, which scrolls horizontally
// (`overflow-x-auto`) instead of overflowing the page — this repo's
// existing wide-table convention (also used by `DesignSystem.tsx`'s other
// callers).
function DiscrepancyItemContent({ model }: { model: DiscrepancyItemModel }) {
	const { cachedRow, liveRow, mismatchedFields } = model.discrepancy;
	const fieldNames = discrepancyFieldNames(model.discrepancy);

	function row(label: string, source: Record<string, unknown> | null) {
		return (
			<tr>
				<th scope="row">{label}</th>
				{fieldNames.map((field) => (
					<td
						key={field}
						className={
							mismatchedFields.includes(field) ? 'text-error' : undefined
						}
					>
						{formatCellValue(source, field)}
					</td>
				))}
			</tr>
		);
	}

	if (fieldNames.length === 0) {
		return <p>No column-level differences to show.</p>;
	}

	return (
		<Table>
			<thead>
				<tr>
					<th scope="col"></th>
					{fieldNames.map((field) => (
						<th scope="col" key={field}>
							{field}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{row('Cached', cachedRow)}
				{row('Live', liveRow)}
			</tbody>
		</Table>
	);
}

function discrepancyItemId(
	scope: DiscrepancyScope,
	discrepancy: StatsCacheDiscrepancy
): string {
	return `${discrepancyScopeKey(scope)}:${discrepancy.species_id ?? 'all'}:${discrepancy.time_period ?? 'all-time'}`;
}

function DiscrepancyList({
	scope,
	discrepancies,
	speciesNamesById,
	fixRequests
}: {
	scope: DiscrepancyScope;
	discrepancies: StatsCacheDiscrepancy[];
	speciesNamesById: Record<number, string>;
	fixRequests: FixRequestState;
}) {
	const [expandedId, setExpandedId] = useState<string | false>(false);

	if (discrepancies.length === 0) {
		return <p>No discrepancies found</p>;
	}

	return (
		<BoxyList>
			{discrepancies.map((discrepancy) => {
				const id = discrepancyItemId(scope, discrepancy);
				const row = discrepancyRowScope(scope, discrepancy);
				return (
					<AccordionItem<DiscrepancyItemModel>
						key={id}
						id={id}
						actions={
							<DiscrepancyRowFixButtons
								row={row}
								isFixRequested={fixRequests.dispatches.some((dispatch) =>
									isDiscrepancyRowCoveredByFixDispatch(row, dispatch)
								)}
								onFixRequested={fixRequests.onFixRequested}
							/>
						}
						HeadingComponent={DiscrepancyItemHeading}
						ContentComponent={DiscrepancyItemContent}
						model={{
							label: discrepancyItemLabel(
								scope,
								discrepancy.time_period,
								discrepancy.species_id,
								speciesNamesById
							),
							discrepancy
						}}
						onToggle={setExpandedId}
						expandedId={expandedId}
					/>
				);
			})}
		</BoxyList>
	);
}

type LazyScopeState =
	| { kind: 'idle' }
	| { kind: 'loading' }
	| { kind: 'loaded'; discrepancies: StatsCacheDiscrepancy[] }
	| { kind: 'error'; message: string };

function LazyDiscrepancyScopeSection({
	scope,
	speciesNamesById,
	fixRequests
}: {
	scope: DiscrepancyScope;
	speciesNamesById: Record<number, string>;
	fixRequests: FixRequestState;
}) {
	const [state, setState] = useState<LazyScopeState>({ kind: 'idle' });

	async function runCheck() {
		setState({ kind: 'loading' });
		const result = await fetchStatsCacheDiscrepancies({
			temporalUnit: scope.temporalUnit,
			bySpecies: scope.bySpecies
		});
		setState(
			result.success
				? { kind: 'loaded', discrepancies: result.discrepancies }
				: { kind: 'error', message: result.error }
		);
	}

	if (state.kind === 'idle') {
		return (
			<button type="button" className="btn btn-sm" onClick={runCheck}>
				Run check
			</button>
		);
	}
	if (state.kind === 'loading') {
		return <p>Checking…</p>;
	}
	if (state.kind === 'error') {
		return (
			<p role="alert" className="text-error text-sm">
				{state.message}
			</p>
		);
	}
	return (
		<DiscrepancyList
			scope={scope}
			discrepancies={state.discrepancies}
			speciesNamesById={speciesNamesById}
			fixRequests={fixRequests}
		/>
	);
}

/**
 * Runs every `EAGER_DISCREPANCY_SCOPES` entry automatically, one at a time,
 * starting once this component mounts (i.e. after the page itself has
 * already rendered) — never in parallel, and never blocking the initial
 * render, per PR #1393 review: each comparison is a real set of DB round
 * trips, so firing all 6 at once would still be an expensive thundering
 * herd even though these 3 temporal units are individually bounded.
 * A scope not yet reached in the queue is indistinguishable from one
 * currently in flight — both read as `undefined` here and render the same
 * "Checking…" state as a lazy scope's own in-flight state.
 */
function useEagerDiscrepancyScopeResults(): DiscrepancyScopeResults {
	const [results, setResults] = useState<DiscrepancyScopeResults>({});

	useEffect(() => {
		let cancelled = false;

		async function runEagerScopesInSeries() {
			for (const scope of EAGER_DISCREPANCY_SCOPES) {
				if (cancelled) {
					return;
				}
				const result = await fetchStatsCacheDiscrepancies({
					temporalUnit: scope.temporalUnit,
					bySpecies: scope.bySpecies
				});
				if (cancelled) {
					return;
				}
				setResults((previous) => ({
					...previous,
					[discrepancyScopeKey(scope)]: result
				}));
			}
		}

		runEagerScopesInSeries();
		return () => {
			cancelled = true;
		};
	}, []);

	return results;
}

function EagerDiscrepancyScopeSection({
	scope,
	result,
	speciesNamesById,
	fixRequests
}: {
	scope: DiscrepancyScope;
	result: FetchStatsCacheDiscrepanciesResult | undefined;
	speciesNamesById: Record<number, string>;
	fixRequests: FixRequestState;
}) {
	if (!result) {
		return <p>Checking…</p>;
	}
	if (!result.success) {
		return (
			<p role="alert" className="text-error text-sm">
				{result.error}
			</p>
		);
	}
	return (
		<DiscrepancyList
			scope={scope}
			discrepancies={result.discrepancies}
			speciesNamesById={speciesNamesById}
			fixRequests={fixRequests}
		/>
	);
}

function DiscrepancyScopeSection({
	scope,
	eagerResult,
	speciesNamesById,
	fixRequests
}: {
	scope: DiscrepancyScope;
	eagerResult: FetchStatsCacheDiscrepanciesResult | undefined;
	speciesNamesById: Record<number, string>;
	fixRequests: FixRequestState;
}) {
	return (
		<section data-testid={`discrepancy-scope-${discrepancyScopeKey(scope)}`}>
			<h3 className="text-base-content text-lg mt-2 mb-2">
				{discrepancyScopeHeading(scope)}
			</h3>
			{isEagerScope(scope) ? (
				<EagerDiscrepancyScopeSection
					scope={scope}
					result={eagerResult}
					speciesNamesById={speciesNamesById}
					fixRequests={fixRequests}
				/>
			) : (
				<LazyDiscrepancyScopeSection
					scope={scope}
					speciesNamesById={speciesNamesById}
					fixRequests={fixRequests}
				/>
			)}
		</section>
	);
}

/**
 * The read-only stats-cache discrepancy report (#1387) — one section per
 * `DISCREPANCY_SCOPES` entry, in that fixed order. The `all-time`/`year`/
 * `month-squashed` scopes run automatically, one at a time, starting after
 * this component mounts (`useEagerDiscrepancyScopeResults`) — never
 * blocking the page's own initial render and never firing all 6 in
 * parallel (per PR #1393 review). The `month`/`day` scopes still render a
 * manual "Run check" trigger, deferring their own comparison call until
 * clicked — see this ticket's "Performance-scoping design" for why those
 * two stay opt-in rather than automatic.
 *
 * Each row also carries #1390's `DiscrepancyRowFixButtons`, and this
 * component owns the list of successfully-dispatched fix scopes they flip
 * rows on — see `FixRequestState` for why that state is report-wide rather
 * than per section, and `DiscrepancyRowFixButtons`' own doc comment for why
 * a "fix requested" row is never re-checked or removed without a reload.
 */
export function StatsCacheDiscrepanciesReport({
	speciesNamesById
}: {
	speciesNamesById: Record<number, string>;
}) {
	const eagerResults = useEagerDiscrepancyScopeResults();
	const [fixRequestedDispatches, setFixRequestedDispatches] = useState<
		StatsCacheFixDispatch[]
	>([]);
	const fixRequests: FixRequestState = {
		dispatches: fixRequestedDispatches,
		onFixRequested: (dispatch) =>
			setFixRequestedDispatches((previous) => [...previous, dispatch])
	};
	return (
		<div>
			<SecondaryHeading>Stats cache discrepancies</SecondaryHeading>
			{DISCREPANCY_SCOPES.map((scope) => (
				<DiscrepancyScopeSection
					key={discrepancyScopeKey(scope)}
					scope={scope}
					eagerResult={eagerResults[discrepancyScopeKey(scope)]}
					speciesNamesById={speciesNamesById}
					fixRequests={fixRequests}
				/>
			))}
		</div>
	);
}
