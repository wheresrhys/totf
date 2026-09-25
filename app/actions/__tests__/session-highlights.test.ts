import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StatsPerDayAndSpeciesResult } from '@/app/models/db';
import type {
	LongAbsenceRetrapHighlight,
	SessionHighlight,
	VitalStatHighlight
} from '@/app/lib/highlights';
import {
	renderVitalStatHighlight,
	VITAL_STAT_HIGHLIGHT_RENDERERS
} from '@/app/components/highlights';
import { renderLongAbsenceRetrapHighlight } from '@/app/components/highlights/long-absence-retrap-renderer';
import { makeQueryChain } from '@/app/__tests__/helpers/query-chain';

// The action now fans out across two groups only — Vital stats plus the
// long-absence-retrap sibling (per #760) — since Counts (#989) and Rarities
// (#990) moved to the v2 pipeline (app/lib/highlights/v2), which the session
// page fetches separately. This dispatches a flat SessionHighlight[] to
// whichever group's renderer matches, the same way SessionHighlights.tsx
// partitions the list into its sections. Vital stats' weight records are
// therefore this suite's observable for "a row reached the derive functions".
const VITAL_STAT_TYPES = new Set(Object.keys(VITAL_STAT_HIGHLIGHT_RENDERERS));

function renderHighlight(highlight: SessionHighlight) {
	if (VITAL_STAT_TYPES.has(highlight.type)) {
		return renderVitalStatHighlight(highlight as VitalStatHighlight);
	}
	return renderLongAbsenceRetrapHighlight(
		highlight as LongAbsenceRetrapHighlight
	);
}

// The action returns plain highlight data; rendering each gives the
// <li key={sentence}>{sentence}</li> whose sentence we assert on
function sentencesOf(highlights: SessionHighlight[]): string[] {
	return highlights.map(
		(highlight) =>
			(renderHighlight(highlight).props as { children: string }).children
	);
}

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const SESSION_DATE = '2024-09-15';
const GROUP_ID = 1;
const PAGE_SIZE = 1000;

// Queries are paginated (PostgREST caps responses at 1000 rows), so the
// mock builders serve rows page by page from these arrays
let rpcPages: StatsPerDayAndSpeciesResult[][];
let sessionPages: { visit_date: string }[][];

function statsRow(
	species_name: string,
	visit_date: string,
	encounter_count: number,
	weights?: { weighed: number; min: number; max: number }
): StatsPerDayAndSpeciesResult {
	return {
		species_name,
		visit_date,
		encounter_count,
		juv_count: 0,
		postjuv_count: 0,
		pullus_count: 0,
		weighed_birds_count: weights?.weighed ?? 0,
		min_weight: weights?.min ?? 0,
		max_weight: weights?.max ?? 0
	};
}

// Three earlier days on which Blue Tit was weighed — enough weighed encounters
// (and a low enough heaviest) for a heavier bird on any later day to take the
// all-time heaviest-weight record. The session's own lightest (11g) is heavier
// than all three, so only the "heaviest" line is ever derived.
const BLUE_TIT_BASELINE_DATES = ['2022-05-01', '2022-06-01', '2022-07-01'];

function blueTitBaselineRows(): StatsPerDayAndSpeciesResult[] {
	return [
		statsRow('Blue Tit', BLUE_TIT_BASELINE_DATES[0], 4, {
			weighed: 4,
			min: 10.5,
			max: 13.0
		}),
		statsRow('Blue Tit', BLUE_TIT_BASELINE_DATES[1], 4, {
			weighed: 4,
			min: 10.7,
			max: 12.8
		}),
		statsRow('Blue Tit', BLUE_TIT_BASELINE_DATES[2], 4, {
			weighed: 4,
			min: 10.8,
			max: 12.9
		})
	];
}

function blueTitRecordRow(
	visit_date: string,
	max: number
): StatsPerDayAndSpeciesResult {
	return statsRow('Blue Tit', visit_date, 5, { weighed: 5, min: 11, max });
}

function heaviestSentence(max: number) {
	return `Heaviest Blue Tit ever weighed — ${max}g`;
}

let statsVersion = 100;
// Overrides the Encounters version-query's resolved rows for a single test
// (e.g. simulating a group with no encounters at all) — see
// "treats a group with no encounters as version 0" below.
let encountersRowsOverride: { id: number }[] | undefined;

// The paginated rpc (stats_per_day_and_species) and the Sessions query both
// page through PAGE_SIZE-row batches, resolved from rpcPages/sessionPages by
// whichever `.range(fromRow, ...)` call most recently ran on that chain.
const rpcChain = makeQueryChain(
	(fromRow: number = 0) => rpcPages[fromRow / PAGE_SIZE] ?? []
);
const sessionsChain = makeQueryChain(
	(fromRow: number = 0) => sessionPages[fromRow / PAGE_SIZE] ?? []
);
// Encounters version query — not paginated, but re-reads mutable test state
// (statsVersion/encountersRowsOverride) lazily on every `.limit()` call.
const encountersChain = makeQueryChain(
	() => encountersRowsOverride ?? [{ id: statsVersion }]
);

// The paginated rpc (stats_per_day_and_species) returns a query builder;
// the non-paginated rpc (long_absence_retraps) returns a thenable.
const mockLongAbsenceRpcResult = Promise.resolve({ data: [], error: null });
const mockRpc = vi.fn();
mockRpc.mockImplementation((functionName: string) => {
	if (functionName === 'long_absence_retraps') {
		return mockLongAbsenceRpcResult;
	}
	return rpcChain.chain;
});

const mockFrom = vi.fn((table: string) => {
	if (table === 'Sessions') {
		return sessionsChain.chain;
	}
	// Encounters — version query
	return encountersChain.chain;
});

// Aliases so assertions below can name each mocked method directly, the same
// way the ad hoc mockXxx references used to.
const mockRpcOrder = rpcChain.chain.order;
const mockRpcRange = rpcChain.chain.range;
const mockSessionsOrder = sessionsChain.chain.order;
const mockSessionsRange = sessionsChain.chain.range;
const mockSessionsEq = sessionsChain.chain.eq;
const mockSessionsSelect = sessionsChain.chain.select;
const mockEncountersLimit = encountersChain.chain.limit;
const mockEncountersOrder = encountersChain.chain.order;
const mockEncountersEq = encountersChain.chain.eq;
const mockEncountersSelect = encountersChain.chain.select;
const mockEq = mockSessionsEq;
const mockSelect = mockSessionsSelect;

// the action memoises the stats blob at module scope, so each test
// imports a fresh copy of the module
async function importFetchSessionHighlights() {
	vi.resetModules();
	const { fetchSessionHighlights } = await import('../session-highlights');
	return fetchSessionHighlights;
}

beforeEach(() => {
	vi.clearAllMocks();
	statsVersion = 100;
	encountersRowsOverride = undefined;
	rpcPages = [[...blueTitBaselineRows(), blueTitRecordRow(SESSION_DATE, 13.1)]];
	sessionPages = [
		[
			...BLUE_TIT_BASELINE_DATES.map((visit_date) => ({ visit_date })),
			{ visit_date: SESSION_DATE }
		]
	];
	mockGetAuthenticatedSupabaseClient.mockResolvedValue({
		rpc: mockRpc,
		from: mockFrom
	});
});

describe('fetchSessionHighlights', () => {
	it('fetches day-species metrics and long-absence retraps in parallel', async () => {
		const fetchSessionHighlights = await importFetchSessionHighlights();
		const highlights = await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		// Two rpc calls: stats_per_day_and_species (paginated) and
		// long_absence_retraps (non-paginated)
		expect(mockRpc).toHaveBeenCalledTimes(2);
		const rpcFunctionNames = mockRpc.mock.calls.map(
			(call) => (call as [string, unknown])[0]
		);
		expect(rpcFunctionNames).toContain('stats_per_day_and_species');
		expect(rpcFunctionNames).toContain('long_absence_retraps');
		const [, statsArgs] = mockRpc.mock.calls.find(
			(call) => (call as [string, unknown])[0] === 'stats_per_day_and_species'
		) as [string, { ringing_group_filter: number }];
		expect(statsArgs.ringing_group_filter).toBe(GROUP_ID);
		// The session's 13.1g Blue Tit beats the heaviest of all three baseline
		// days, so the Vital-stats group derives its all-time heaviest record.
		// Counts (#989) and Rarities (#990) have both left this fan-out for the v2
		// pipeline (app/lib/highlights/v2), which produces their lines separately,
		// so the weight record is all that survives here.
		expect(sentencesOf(highlights)).toEqual([heaviestSentence(13.1)]);
	});

	it('fetches session dates', async () => {
		const fetchSessionHighlights = await importFetchSessionHighlights();
		await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		expect(mockFrom).toHaveBeenCalledWith('Sessions');
		expect(mockSelect).toHaveBeenCalledWith('visit_date');
		expect(mockEq).toHaveBeenCalledWith('ringing_group_id', GROUP_ID);
	});

	it('excludes non-FULL_GROWN sessions from the session-dates query', async () => {
		const fetchSessionHighlights = await importFetchSessionHighlights();
		await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		expect(mockSessionsEq).toHaveBeenCalledWith('session_type', 'FULL_GROWN');
	});

	it('requests deterministic ordering for paginated queries', async () => {
		const fetchSessionHighlights = await importFetchSessionHighlights();
		await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		expect(mockRpcOrder).toHaveBeenCalledWith('visit_date');
		expect(mockRpcOrder).toHaveBeenCalledWith('species_name');
		expect(mockRpcRange).toHaveBeenCalledWith(0, PAGE_SIZE - 1);
		expect(mockSessionsOrder).toHaveBeenCalledWith('visit_date');
		expect(mockSessionsRange).toHaveBeenCalledWith(0, PAGE_SIZE - 1);
	});

	it('derives highlights from rows beyond the first page', async () => {
		rpcPages = [
			[
				...blueTitBaselineRows(),
				...Array.from({ length: PAGE_SIZE - 3 }, (_, index) =>
					statsRow(`Species ${index}`, '2022-05-01', 1)
				)
			],
			[blueTitRecordRow(SESSION_DATE, 13.1)]
		];
		const fetchSessionHighlights = await importFetchSessionHighlights();
		const highlights = await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		expect(mockRpcRange).toHaveBeenCalledTimes(2);
		expect(mockRpcRange).toHaveBeenNthCalledWith(
			2,
			PAGE_SIZE,
			2 * PAGE_SIZE - 1
		);
		// The session's own Blue Tit row only appears on the second page (page 1 is
		// the three baseline days plus unrelated species) — this proves the second
		// page's row genuinely reached the derive functions, since the weight record
		// can only be computed if that page-2 row was included in the stats blob.
		expect(sentencesOf(highlights)).toContain(heaviestSentence(13.1));
	});

	it('derives no highlights for a date whose only session is PULLI or FIELD_OBSERVATION, while other days stay unaffected', async () => {
		// A PULLI or FIELD_OBSERVATION date is excluded from both
		// stats_per_day_and_species (filtered at the RPC level) and the
		// sessionDates query (filtered by this ticket's Sessions
		// .eq('session_type', 'FULL_GROWN')) — it's simply absent from both stats
		// blobs fed into every derive* function, so it's indistinguishable from
		// "no session happened that day".
		rpcPages = [
			[...blueTitBaselineRows(), blueTitRecordRow('2022-08-01', 13.5)]
		];
		sessionPages = [
			[
				...BLUE_TIT_BASELINE_DATES.map((visit_date) => ({ visit_date })),
				{ visit_date: '2022-08-01' }
			]
		];
		const fetchSessionHighlights = await importFetchSessionHighlights();
		const flaggedDateHighlights = await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		expect(flaggedDateHighlights).toEqual([]);
		// A real session day untouched by the flagged date still derives its
		// species-level highlights normally
		const realDayHighlights = await fetchSessionHighlights({
			date: '2022-08-01',
			viewedGroupId: GROUP_ID
		});
		expect(sentencesOf(realDayHighlights)).toEqual([heaviestSentence(13.5)]);
	});

	it('serves cached stats when the data version is unchanged', async () => {
		// The Blue Tit weight record falls on 2022-08-01, not on the first date
		// queried, so the second fetch can only produce it from the cached blob.
		rpcPages = [
			[...blueTitBaselineRows(), blueTitRecordRow('2022-08-01', 13.5)]
		];
		sessionPages = [
			[
				...BLUE_TIT_BASELINE_DATES.map((visit_date) => ({ visit_date })),
				{ visit_date: '2022-08-01' },
				{ visit_date: SESSION_DATE }
			]
		];
		const fetchSessionHighlights = await importFetchSessionHighlights();
		await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		const secondResult = await fetchSessionHighlights({
			date: '2022-08-01',
			viewedGroupId: GROUP_ID
		});
		// stats_per_day_and_species is cached (called once), but
		// long_absence_retraps is per-session (called twice)
		const metricsCalls = mockRpc.mock.calls.filter(
			(call) => (call as [string])[0] === 'stats_per_day_and_species'
		);
		expect(metricsCalls).toHaveLength(1);
		// Two .eq() calls per fetch (ringing_group_id, session_type), and
		// the session-dates query only runs once thanks to the stats cache
		expect(mockSessionsEq).toHaveBeenCalledTimes(2);
		// version query is run on each call
		expect(mockEncountersLimit).toHaveBeenCalledTimes(2);
		// the cached blob still serves other session dates — the 2022-08-01 weight
		// record is derived from the same cached stats blob used for the
		// SESSION_DATE fetch above
		expect(sentencesOf(secondResult)).toEqual([heaviestSentence(13.5)]);
	});

	it('re-fetches stats when the data version changes', async () => {
		const fetchSessionHighlights = await importFetchSessionHighlights();
		statsVersion = 100;
		await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		statsVersion = 101;
		await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		const metricsCalls = mockRpc.mock.calls.filter(
			(call) => (call as [string])[0] === 'stats_per_day_and_species'
		);
		expect(metricsCalls).toHaveLength(2);
	});

	it('queries max Encounters id for the viewed group', async () => {
		const fetchSessionHighlights = await importFetchSessionHighlights();
		await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		expect(mockFrom).toHaveBeenCalledWith('Encounters');
		expect(mockEncountersSelect).toHaveBeenCalledWith('id');
		expect(mockEncountersEq).toHaveBeenCalledWith('ringing_group_id', GROUP_ID);
		expect(mockEncountersOrder).toHaveBeenCalledWith('id', {
			ascending: false
		});
		expect(mockEncountersLimit).toHaveBeenCalledWith(1);
	});

	it('treats a group with no encounters as version 0', async () => {
		encountersRowsOverride = [];
		// Same fixture as the caching test above: the weight record falls on
		// 2022-08-01, so the second fetch can only produce it from the cache.
		rpcPages = [
			[...blueTitBaselineRows(), blueTitRecordRow('2022-08-01', 13.5)]
		];
		sessionPages = [
			[
				...BLUE_TIT_BASELINE_DATES.map((visit_date) => ({ visit_date })),
				{ visit_date: '2022-08-01' },
				{ visit_date: SESSION_DATE }
			]
		];
		const fetchSessionHighlights = await importFetchSessionHighlights();
		await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		const secondResult = await fetchSessionHighlights({
			date: '2022-08-01',
			viewedGroupId: GROUP_ID
		});
		// stats_per_day_and_species should be cached (called once)
		const metricsCalls = mockRpc.mock.calls.filter(
			(call) => (call as [string])[0] === 'stats_per_day_and_species'
		);
		expect(metricsCalls).toHaveLength(1);
		expect(sentencesOf(secondResult)).toEqual([heaviestSentence(13.5)]);
	});
});
