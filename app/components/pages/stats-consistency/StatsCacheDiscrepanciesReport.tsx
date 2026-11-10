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

/**
 * One per-cell row, shared by the flat (combined-scope) list below and each
 * species group's nested list — the only difference between the two call
 * sites is the label: a nested row drops the by-species scope's own
 * "for species <name>" suffix (the species is already the group's own
 * heading), by asking `discrepancyItemLabel` for the combined-scope label
 * shape instead.
 */
function DiscrepancyRow({
	scope,
	discrepancy,
	speciesNamesById,
	fixRequests,
	expandedId,
	onToggle,
	labelScope = scope
}: {
	scope: DiscrepancyScope;
	discrepancy: StatsCacheDiscrepancy;
	speciesNamesById: Record<number, string>;
	fixRequests: FixRequestState;
	expandedId: string | false;
	onToggle: (id: string | false) => void;
	labelScope?: DiscrepancyScope;
}) {
	const id = discrepancyItemId(scope, discrepancy);
	const row = discrepancyRowScope(scope, discrepancy);
	return (
		<AccordionItem<DiscrepancyItemModel>
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
					labelScope,
					discrepancy.time_period,
					discrepancy.species_id,
					speciesNamesById
				),
				discrepancy
			}}
			onToggle={onToggle}
			expandedId={expandedId}
		/>
	);
}

type SpeciesDiscrepancyGroupModel = {
	id: string;
	speciesLabel: string;
	scope: DiscrepancyScope;
	discrepancies: StatsCacheDiscrepancy[];
	speciesNamesById: Record<number, string>;
	fixRequests: FixRequestState;
};

function SpeciesGroupHeading({
	model
}: {
	model: SpeciesDiscrepancyGroupModel;
}) {
	return (
		<span>
			{model.speciesLabel} ({model.discrepancies.length})
		</span>
	);
}

/**
 * One species group's nested per-period list — collapsed by default, and
 * reset to collapsed whenever this group itself stops being the expanded one
 * (a sibling species expands, or this one collapses), the same
 * `expandedId`-vs-own-`id` pattern `YearSessions`/`MonthSessions` use for
 * their year→month nesting: `AccordionItem` always mounts its
 * `ContentComponent` (just CSS-hides it while collapsed) and passes it the
 * *species*-level `expandedId`, so comparing that against this group's own
 * `model.id` is exactly "am I the expanded species right now".
 */
function SpeciesGroupContent({
	model,
	expandedId
}: {
	model: SpeciesDiscrepancyGroupModel;
	expandedId: string | false;
}) {
	const [expandedPeriodId, setExpandedPeriodId] = useState<string | false>(
		false
	);

	useEffect(() => {
		if (expandedId !== model.id) {
			setExpandedPeriodId(false);
		}
	}, [expandedId, model.id]);

	return (
		<BoxyList>
			{model.discrepancies.map((discrepancy) => (
				<DiscrepancyRow
					key={discrepancyItemId(model.scope, discrepancy)}
					scope={model.scope}
					labelScope={{ ...model.scope, bySpecies: false }}
					discrepancy={discrepancy}
					speciesNamesById={model.speciesNamesById}
					fixRequests={model.fixRequests}
					expandedId={expandedPeriodId}
					onToggle={setExpandedPeriodId}
				/>
			))}
		</BoxyList>
	);
}

/** Every discrepancy for one `species_id`, in the order `discrepancies` arrived in. */
function groupDiscrepanciesBySpecies(
	discrepancies: StatsCacheDiscrepancy[]
): Map<number, StatsCacheDiscrepancy[]> {
	const groups = new Map<number, StatsCacheDiscrepancy[]>();
	for (const discrepancy of discrepancies) {
		// Always non-null here — a by-species scope's cells all carry a real
		// species_id (SimpleStatsCacheBySpecies' species_id column is NOT NULL,
		// and the species-grouped metric RPCs never emit a null one either).
		const speciesId = discrepancy.species_id as number;
		const group = groups.get(speciesId) ?? [];
		group.push(discrepancy);
		groups.set(speciesId, group);
	}
	return groups;
}

/**
 * The by-species report, grouped: species at the top level (collapsed by
 * default, single-expand across species), that species' discrepant
 * days/months/etc. nested underneath. See `SpeciesGroupContent` for the
 * nested list's own collapse-on-switch behaviour.
 */
function SpeciesGroupedDiscrepancyList({
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
	const [expandedSpeciesId, setExpandedSpeciesId] = useState<string | false>(
		false
	);
	const groups = groupDiscrepanciesBySpecies(discrepancies);
	const sortedSpeciesIds = [...groups.keys()].sort((a, b) =>
		(speciesNamesById[a] ?? `species #${a}`).localeCompare(
			speciesNamesById[b] ?? `species #${b}`
		)
	);

	return (
		<BoxyList>
			{sortedSpeciesIds.map((speciesId) => {
				const id = `${discrepancyScopeKey(scope)}:species:${speciesId}`;
				return (
					<AccordionItem<SpeciesDiscrepancyGroupModel>
						key={id}
						id={id}
						HeadingComponent={SpeciesGroupHeading}
						ContentComponent={SpeciesGroupContent}
						model={{
							id,
							speciesLabel: speciesNamesById[speciesId] ?? `species #${speciesId}`,
							scope,
							discrepancies: groups.get(speciesId) as StatsCacheDiscrepancy[],
							speciesNamesById,
							fixRequests
						}}
						onToggle={setExpandedSpeciesId}
						expandedId={expandedSpeciesId}
					/>
				);
			})}
		</BoxyList>
	);
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

	if (scope.bySpecies) {
		return (
			<SpeciesGroupedDiscrepancyList
				scope={scope}
				discrepancies={discrepancies}
				speciesNamesById={speciesNamesById}
				fixRequests={fixRequests}
			/>
		);
	}

	return (
		<BoxyList>
			{discrepancies.map((discrepancy) => (
				<DiscrepancyRow
					key={discrepancyItemId(scope, discrepancy)}
					scope={scope}
					discrepancy={discrepancy}
					speciesNamesById={speciesNamesById}
					fixRequests={fixRequests}
					expandedId={expandedId}
					onToggle={setExpandedId}
				/>
			))}
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
