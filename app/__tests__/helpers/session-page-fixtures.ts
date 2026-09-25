import { vi } from 'vitest';

/**
 * Shared fixtures for the session detail page
 * (`app/(routes)/group/[groupSlug]/session/[date]/__tests__/page.test.tsx`)
 * and its location-scoped variant
 * (`app/(routes)/group/[groupSlug]/session/[date]/site/[locationId]/__tests__/page.test.tsx`),
 * which independently re-declared near-identical `makeChain`/`mockSessions`/
 * `mockPreviousSession`/`mockNextSession`/encounter-row builders — see
 * `reports/test-quality.md`, "Session detail-page test duplicates its
 * parent's fixture builders". `makeSessionClient`-style wiring stays local to
 * each file since the two pages assemble their Supabase call chains
 * differently (the parent takes a variable-length chain list, the
 * location-scoped page also branches on table name in one test) — only the
 * genuinely identical building blocks live here.
 */

export const TEST_DATE = '2024-03-15';
export const TEST_GROUP_ID = '1';
export const TEST_GROUP_SLUG = 'test-group-slug';

export const mockSessions = [
	{
		id: 1,
		location_id: 10,
		location: { id: 10, location_name: 'Test Reserve', ringing_group_id: 1 }
	}
];

/** Two Sessions rows on the same date, for the "multiple locations" scenarios both pages test. */
export const mockMultiLocationSessions = [
	{
		id: 1,
		location_id: 10,
		location: { id: 10, location_name: 'Test Reserve', ringing_group_id: 1 }
	},
	{
		id: 2,
		location_id: 20,
		location: { id: 20, location_name: 'Other Site', ringing_group_id: 1 }
	}
];

export const mockPreviousSession = [{ visit_date: '2024-03-01' }];
export const mockNextSession = [{ visit_date: '2024-04-01' }];

type MockEncounter = {
	id: number;
	session_id: number;
	age_code: number;
	breeding_condition: null;
	capture_time: string;
	moult_code: null;
	record_type: string;
	ringing_group_id: number;
	sex: string;
	sexing_method: null;
	weight: number | null;
	wing_length: number | null;
	bird: {
		ring_no: string;
		proven_age: number;
		species: { id: number; species_name: string };
	};
};

/**
 * `Encounters` row fixture (with embedded `bird`/`species`): flat overrides
 * merged over the shape both test files' rows shared. Both pages' encounter
 * arrays only ever differ in these values, never the shape.
 */
export function makeMockEncounter(
	overrides: Partial<MockEncounter> = {}
): MockEncounter {
	return {
		id: 1,
		session_id: 1,
		age_code: 4,
		breeding_condition: null,
		capture_time: '08:00:00',
		moult_code: null,
		record_type: 'N',
		ringing_group_id: 1,
		sex: 'M',
		sexing_method: null,
		weight: 18.5,
		wing_length: 75,
		bird: {
			ring_no: 'ABC001',
			proven_age: 5,
			species: { id: 1, species_name: 'Robin' }
		},
		...overrides
	};
}

/** A chainable Supabase query-builder mock that resolves to `{ data, error: null }`. */
export function makeChain(data: unknown) {
	return {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		in: vi.fn().mockReturnThis(),
		lt: vi.fn().mockReturnThis(),
		gt: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data, error: null }).then(resolve)
	};
}
