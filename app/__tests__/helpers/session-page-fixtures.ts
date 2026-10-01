import { vi } from 'vitest';

/**
 * Shared fixtures for the session detail page
 * (`app/(routes)/group/[groupSlug]/session/[date]/__tests__/page.test.tsx`).
 * Since #1020 the page queries `Encounters` directly by
 * `(ringing_group_id, visit_date)` and reads each encounter's own embedded
 * `Locations` row, so the fixtures here are encounter rows (plus the chainable
 * Supabase query-builder double they're returned through) rather than the
 * `Sessions` rows the old `Sessions`-join fetch needed.
 */

export const TEST_DATE = '2024-03-15';
export const TEST_GROUP_ID = '1';
export const TEST_GROUP_SLUG = 'test-group-slug';

export const testReserveLocation = {
	id: 10,
	location_name: 'Test Reserve',
	ringing_group_id: 1
};

export const otherSiteLocation = {
	id: 20,
	location_name: 'Other Site',
	ringing_group_id: 1
};

export const mockPreviousSession = [{ visit_date: '2024-03-01' }];
export const mockNextSession = [{ visit_date: '2024-04-01' }];

type MockLocation = {
	id: number;
	location_name: string;
	ringing_group_id: number;
};

type MockEncounter = {
	id: number;
	session_id: number;
	location_id: number;
	visit_date: string;
	age_code: number;
	breeding_condition: null;
	capture_method: string | null;
	capture_time: string;
	moult_code: null;
	record_type: string;
	ringing_group_id: number;
	sex: string;
	sexing_method: null;
	weight: number | null;
	wing_length: number | null;
	location: MockLocation;
	bird: {
		ring_no: string;
		proven_age: number;
		species: { id: number; species_name: string };
	};
};

/**
 * `Encounters` row fixture (with embedded `location`/`bird`/`species`): flat
 * overrides merged over the shape the page's own fetch selects.
 */
export function makeMockEncounter(
	overrides: Partial<MockEncounter> = {}
): MockEncounter {
	return {
		id: 1,
		session_id: 1,
		location_id: testReserveLocation.id,
		visit_date: TEST_DATE,
		age_code: 4,
		breeding_condition: null,
		capture_method: 'M',
		capture_time: '08:00:00',
		moult_code: null,
		record_type: 'N',
		ringing_group_id: 1,
		sex: 'M',
		sexing_method: null,
		weight: 18.5,
		wing_length: 75,
		location: testReserveLocation,
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
		not: vi.fn().mockReturnThis(),
		lt: vi.fn().mockReturnThis(),
		gt: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data, error: null }).then(resolve)
	};
}
