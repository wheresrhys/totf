import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StatsPerDayAndSpeciesResult } from '@/app/models/db';
import type {
	LongAbsenceRetrapHighlight,
	RarityHighlight,
	SessionHighlight,
	VitalStatHighlight
} from '@/app/lib/highlights';
import {
	renderRarityHighlight,
	RARITY_HIGHLIGHT_RENDERERS,
	renderVitalStatHighlight,
	VITAL_STAT_HIGHLIGHT_RENDERERS
} from '@/app/components/highlights';
import { renderLongAbsenceRetrapHighlight } from '@/app/components/highlights/long-absence-retrap-renderer';
import { makeQueryChain } from '@/app/__tests__/helpers/query-chain';

// The action fans out across all four groups (three componentized renderers
// plus the long-absence-retrap sibling, per #760); this dispatches a flat
// SessionHighlight[] to whichever group's renderer matches, the same way
// SessionHighlights.tsx partitions the list into its sections.
const RARITY_TYPES = new Set(Object.keys(RARITY_HIGHLIGHT_RENDERERS));
const VITAL_STAT_TYPES = new Set(Object.keys(VITAL_STAT_HIGHLIGHT_RENDERERS));

function renderHighlight(highlight: SessionHighlight) {
	if (RARITY_TYPES.has(highlight.type)) {
		return renderRarityHighlight(highlight as RarityHighlight);
	}
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
	encounter_count: number
): StatsPerDayAndSpeciesResult {
	return {
		species_name,
		visit_date,
		encounter_count,
		juv_count: 0,
		postjuv_count: 0,
		pullus_count: 0,
		weighed_birds_count: 0,
		min_weight: 0,
		max_weight: 0
	};
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
	rpcPages = [
		[
			statsRow('Robin', SESSION_DATE, 74),
			statsRow('Robin', '2022-05-01', 30),
			statsRow('Wren', '2022-05-01', 30)
		]
	];
	sessionPages = [[{ visit_date: '2022-05-01' }, { visit_date: SESSION_DATE }]];
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
		// Robin is a rare species here (seen on only 2 days ever). This is also
		// the first session of 2024 (the only prior session is 2022), so Robin —
		// last seen in 2022 — is first (in fact only) of the year. That "only of
		// year" line and Robin's rare-species line fold together (rarities'
		// Comb-0) into a single MEGA headline that leads the list. The Counts
		// group (busiest/quietest session, species record-day lines) has been
		// removed from this fan-out — see the v2 highlight pipeline
		// (app/lib/highlights/v2), which now produces those lines separately —
		// so only the Rarities-group MEGA headline survives here.
		expect(sentencesOf(highlights)).toEqual([
			'MEGA — Only Robin records of 2024 (only 2 records ever)'
		]);
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
			Array.from({ length: PAGE_SIZE }, (_, index) =>
				statsRow(`Species ${index}`, '2022-05-01', 1)
			),
			[statsRow('Robin', SESSION_DATE, 2000)]
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
		// Robin only appears on the second page (page 1 is 1000 unrelated
		// species) — this proves the second page's row genuinely reached the
		// derive functions, since Robin's "first ever, only record" status can
		// only be computed if its page-2 row was included in the stats blob.
		expect(sentencesOf(highlights)).toContain('Only Robin records ever');
	});

	it('includes weight record highlights in the fan-out', async () => {
		// Blue Tit appears on enough session days to be a common (non-rare)
		// species — this test is about the Vital-stats weight fan-out
		rpcPages = [
			[
				{
					species_name: 'Blue Tit',
					visit_date: SESSION_DATE,
					encounter_count: 5,
					juv_count: 0,
					postjuv_count: 0,
					pullus_count: 0,
					weighed_birds_count: 5,
					min_weight: 11,
					max_weight: 13.1
				},
				{
					species_name: 'Blue Tit',
					visit_date: '2022-05-01',
					encounter_count: 4,
					juv_count: 0,
					postjuv_count: 0,
					pullus_count: 0,
					weighed_birds_count: 4,
					min_weight: 10.5,
					max_weight: 13.0
				},
				{
					species_name: 'Blue Tit',
					visit_date: '2022-06-01',
					encounter_count: 4,
					juv_count: 0,
					postjuv_count: 0,
					pullus_count: 0,
					weighed_birds_count: 4,
					min_weight: 10.7,
					max_weight: 12.8
				},
				{
					species_name: 'Blue Tit',
					visit_date: '2022-07-01',
					encounter_count: 4,
					juv_count: 0,
					postjuv_count: 0,
					pullus_count: 0,
					weighed_birds_count: 4,
					min_weight: 10.8,
					max_weight: 12.9
				}
			]
		];
		sessionPages = [
			[
				{ visit_date: '2022-05-01' },
				{ visit_date: '2022-06-01' },
				{ visit_date: '2022-07-01' },
				{ visit_date: SESSION_DATE }
			]
		];
		const fetchSessionHighlights = await importFetchSessionHighlights();
		const highlights = await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		expect(sentencesOf(highlights)).toContain(
			'Heaviest Blue Tit ever weighed — 13.1g'
		);
	});

	it('includes rare-species highlights in the fan-out', async () => {
		// Both Firecrest days fall in the session's year, so it is not first of the
		// year — the rare-species line stands alone rather than folding into a MEGA
		rpcPages = [
			[
				statsRow('Firecrest', SESSION_DATE, 1),
				statsRow('Firecrest', '2024-05-01', 1)
			]
		];
		sessionPages = [
			[{ visit_date: '2024-05-01' }, { visit_date: SESSION_DATE }]
		];
		const fetchSessionHighlights = await importFetchSessionHighlights();
		const highlights = await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		expect(sentencesOf(highlights)).toContain(
			'MEGA — Firecrest seen on only 2 days ever'
		);
	});

	it('derives no highlights for a date whose only session is PULLI or FIELD_OBSERVATION, while other days stay unaffected', async () => {
		// A PULLI or FIELD_OBSERVATION date is excluded from both
		// stats_per_day_and_species (filtered at the RPC level) and the
		// sessionDates query (filtered by this ticket's Sessions
		// .eq('session_type', 'FULL_GROWN')) — it's simply absent from both stats
		// blobs fed into every derive* function, so it's indistinguishable from
		// "no session happened that day".
		// An earlier, different-species session (2021-01-01) establishes group
		// history predating 2022-05-01, so 2022-05-01 isn't the group's own
		// first-ever session — Wren's first-ever-species highlight there is
		// otherwise suppressed on a group's literal first session (every
		// species would trivially be "first ever" on day one).
		rpcPages = [
			[
				statsRow('Robin', '2021-01-01', 2),
				statsRow('Wren', '2022-05-01', 5),
				statsRow('Wren', '2022-06-01', 3)
			]
		];
		sessionPages = [
			[
				{ visit_date: '2021-01-01' },
				{ visit_date: '2022-05-01' },
				{ visit_date: '2022-06-01' }
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
			date: '2022-05-01',
			viewedGroupId: GROUP_ID
		});
		expect(sentencesOf(realDayHighlights)).toEqual(['First ever Wren records']);
	});

	it('serves cached stats when the data version is unchanged', async () => {
		// An earlier session (2021-01-01) predates both query dates, so neither
		// is the group's first-ever session — Wren's first-ever-species
		// highlight on 2022-05-01 is then observable rather than suppressed.
		rpcPages = [
			[
				statsRow('Blackbird', '2021-01-01', 2),
				statsRow('Wren', '2022-05-01', 5)
			]
		];
		sessionPages = [
			[
				{ visit_date: '2021-01-01' },
				{ visit_date: '2022-05-01' },
				{ visit_date: SESSION_DATE }
			]
		];
		const fetchSessionHighlights = await importFetchSessionHighlights();
		await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		const secondResult = await fetchSessionHighlights({
			date: '2022-05-01',
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
		// the cached blob still serves other session dates — Wren's only
		// appearance (2022-05-01) is derived from the same cached stats blob
		// used for the SESSION_DATE fetch above
		expect(sentencesOf(secondResult)).toEqual(['Only Wren records ever']);
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
		// Same rationale as the caching test above: an earlier session
		// (2021-01-01) means 2022-05-01 isn't the group's first-ever session.
		rpcPages = [
			[
				statsRow('Blackbird', '2021-01-01', 2),
				statsRow('Wren', '2022-05-01', 5)
			]
		];
		sessionPages = [
			[
				{ visit_date: '2021-01-01' },
				{ visit_date: '2022-05-01' },
				{ visit_date: SESSION_DATE }
			]
		];
		const fetchSessionHighlights = await importFetchSessionHighlights();
		await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		const secondResult = await fetchSessionHighlights({
			date: '2022-05-01',
			viewedGroupId: GROUP_ID
		});
		// stats_per_day_and_species should be cached (called once)
		const metricsCalls = mockRpc.mock.calls.filter(
			(call) => (call as [string])[0] === 'stats_per_day_and_species'
		);
		expect(metricsCalls).toHaveLength(1);
		expect(sentencesOf(secondResult)).toEqual(['Only Wren records ever']);
	});
});
