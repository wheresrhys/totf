import type { StatsTemporalUnit } from '@/app/models/temporal-unit';
import type { ManualStatsCacheRegenerateRequest } from '@/modules/stats/browser';

/**
 * The only three fields #1390's fix buttons ever read off one of the
 * discrepancy report's rows. A row carries plenty more for display (the
 * cached/live value pairs, the species name), but the button/propagation
 * logic is deliberately blind to all of it.
 *
 * `period` is absent only for an `all-time` row (whose cells carry no period
 * at all); `speciesId` only for a row in one of the report's by-species
 * sections.
 */
export type DiscrepancyRowScope = {
	temporalUnit: StatsTemporalUnit;
	period?: string;
	speciesId?: number;
};

/**
 * One dispatched fix request's scope — exactly the params
 * `regenerateStatsCache` (`app/actions/regenerate-stats-cache.ts`) takes, so
 * a built dispatch is passed straight through to it rather than being
 * re-shaped at the call site.
 */
export type StatsCacheFixDispatch = ManualStatsCacheRegenerateRequest;

/**
 * The four buttons #1374 asked for ("2-4 buttons, the latter only showing for
 * issues found on by-species stats"), named by what each one widens the
 * clicked row's own scope to.
 */
export type DiscrepancyRowFixButtonKind =
	| 'this-issue'
	| 'all-periods'
	| 'all-species'
	| 'all-species-and-periods';

export const DISCREPANCY_ROW_FIX_BUTTON_LABELS: Record<
	DiscrepancyRowFixButtonKind,
	string
> = {
	'this-issue': 'Fix just this issue',
	'all-periods': 'Fix for all time periods',
	'all-species': 'Fix for all species',
	'all-species-and-periods': 'Fix for all species and time periods'
};

const OVERALL_ROW_FIX_BUTTON_KINDS: readonly DiscrepancyRowFixButtonKind[] = [
	'this-issue',
	'all-periods'
];

const BY_SPECIES_ROW_FIX_BUTTON_KINDS: readonly DiscrepancyRowFixButtonKind[] =
	[...OVERALL_ROW_FIX_BUTTON_KINDS, 'all-species', 'all-species-and-periods'];

/** An overall row gets 2 buttons, a by-species row all 4 — the two "all species" widenings only mean anything on a row that is narrowed to one species to begin with. */
export function discrepancyRowFixButtonKinds(
	row: DiscrepancyRowScope
): readonly DiscrepancyRowFixButtonKind[] {
	return row.speciesId === undefined
		? OVERALL_ROW_FIX_BUTTON_KINDS
		: BY_SPECIES_ROW_FIX_BUTTON_KINDS;
}

/**
 * Maps one button on one row onto `regenerateStatsCache`'s params:
 * `temporalUnit` is always the row's own, and each button either keeps or
 * drops the row's period and species narrowing.
 *
 * On an `all-time` row there is no period to narrow by, so "fix just this
 * issue" and "fix for all time periods" collapse to the same call — both
 * buttons still render (a harmless duplicate dispatch beats a special case
 * for one of the five temporal units).
 */
export function buildFixDispatchParams(
	row: DiscrepancyRowScope,
	buttonKind: DiscrepancyRowFixButtonKind
): StatsCacheFixDispatch {
	const keepsPeriodNarrowing =
		buttonKind === 'this-issue' || buttonKind === 'all-species';
	const keepsSpeciesNarrowing =
		buttonKind === 'this-issue' || buttonKind === 'all-periods';
	const dispatch: StatsCacheFixDispatch = { temporalUnit: row.temporalUnit };
	if (keepsPeriodNarrowing && row.period !== undefined) {
		dispatch.periods = [row.period];
	}
	if (keepsSpeciesNarrowing && row.speciesId !== undefined) {
		dispatch.speciesIds = [row.speciesId];
	}
	return dispatch;
}

/**
 * Whether a currently-rendered row should flip into the "fix requested" state
 * because an already-dispatched fix covers it too.
 *
 * The two non-obvious clauses both fall out of `refreshSimpleStatsCache`
 * (`modules/stats/lib/refresh/run-refresh-pass.ts`) always running **both**
 * write passes for every dispatched event: the species-grouped write (narrowed
 * to `speciesIds` when given) *and* the plain/overall write, which is never
 * narrowed by `speciesIds` at all. So an overall row matching on period is
 * covered by any dispatch whatsoever, and an overall row's own dispatch —
 * which never sets `speciesIds` — rewrites every species' row for its periods,
 * covering every by-species row too.
 */
export function isDiscrepancyRowCoveredByFixDispatch(
	row: DiscrepancyRowScope,
	dispatch: StatsCacheFixDispatch
): boolean {
	if (row.temporalUnit !== dispatch.temporalUnit) {
		return false;
	}
	const periodCovered =
		dispatch.periods === undefined ||
		// An all-time row has no period, so no period narrowing ever applies.
		row.period === undefined ||
		dispatch.periods.includes(row.period);
	if (!periodCovered) {
		return false;
	}
	if (row.speciesId === undefined) {
		// The overall write pass is never speciesIds-narrowed.
		return true;
	}
	return (
		dispatch.speciesIds === undefined ||
		dispatch.speciesIds.includes(row.speciesId)
	);
}
