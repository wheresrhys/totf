/**
 * Shared encounter-seeding building blocks for the RPC integration test suites
 * under `supabase/__tests__/rpc-functions/`.
 *
 * Every RPC integration test's `beforeAll` needs the same small set of raw
 * inserts — a Locations row, a Sessions row (sometimes cached per `(date,
 * locationId)` so several birds on the same day/location share one session), a
 * Birds row, and an Encounters row with the BTO/male/10:00 defaults this
 * codebase's fixtures always use — reimplemented independently (and
 * repeatedly within some files, across separate `describe` blocks) rather than
 * shared. See reports/test-quality.md's "RPC integration tests reinvent the
 * same encounter-seeding closures" antipattern (#04).
 *
 * These are intentionally low-level: each file's own `addBird`-shaped closure
 * (whose exact signature varies per test — how many encounters, which fields
 * vary, whether locations rotate per encounter, etc.) stays local to that
 * file/describe block and composes these primitives, rather than every file
 * reinventing the raw Supabase inserts underneath it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

type SessionType = 'FULL_GROWN' | 'FIELD_OBSERVATION' | 'PULLI';

/** Inserts a Locations row and returns its id. RLS-scoped — use a group-authenticated client. */
export async function insertTestLocation(
	client: SupabaseClient,
	ringingGroupId: number,
	locationName: string
): Promise<number> {
	const { data, error } = await client
		.from('Locations')
		.insert({ location_name: locationName, ringing_group_id: ringingGroupId })
		.select('id')
		.single();
	if (error) throw error;
	return data!.id;
}

/** Inserts a Sessions row and returns its id. No caching/dedup — always inserts a new row. */
export async function insertTestSession(
	client: SupabaseClient,
	locationId: number,
	visitDate: string,
	sessionType?: SessionType
): Promise<number> {
	const { data, error } = await client
		.from('Sessions')
		.insert({
			visit_date: visitDate,
			location_id: locationId,
			...(sessionType ? { session_type: sessionType } : {})
		})
		.select('id')
		.single();
	if (error) throw error;
	return data!.id;
}

/**
 * Returns a `getSession` function bound to a fresh cache, keyed by `(date,
 * locationId, sessionType)` — the "one shared session per (date, location),
 * reused across birds on that date" pattern repeated across nearly every RPC
 * integration test's fixture setup. The session id is pushed onto `track` the
 * first time it's created (never on a cache hit), matching the `afterAll`
 * cleanup convention (`DELETE ... WHERE id IN (${track.join(', ')})`).
 */
export function createSessionResolver() {
	const cache = new Map<string, number>();
	return async function getSession(
		client: SupabaseClient,
		date: string,
		locationId: number,
		track: number[],
		sessionType?: SessionType
	): Promise<number> {
		const key = `${date}|${locationId}|${sessionType ?? ''}`;
		const cached = cache.get(key);
		if (cached !== undefined) return cached;
		const id = await insertTestSession(client, locationId, date, sessionType);
		cache.set(key, id);
		track.push(id);
		return id;
	};
}

/** Inserts a Birds row and returns its id. */
export async function insertTestBird(
	client: SupabaseClient,
	ringNo: string,
	speciesId: number
): Promise<number> {
	const { data, error } = await client
		.from('Birds')
		.insert({ ring_no: ringNo, species_id: speciesId })
		.select('id')
		.single();
	if (error) throw error;
	return data!.id;
}

/**
 * Inserts an Encounters row with the `capture_time: '10:00:00' / scheme: 'BTO'
 * / sex: 'M'` defaults nearly every RPC integration test fixture uses,
 * overridden/extended by `fields` (age_code, is_juv, record_type, weight,
 * wing_length, capture_time, ...). Returns the new row's id.
 */
export async function insertTestEncounter(
	client: SupabaseClient,
	birdId: number,
	sessionId: number,
	fields: {
		age_code?: number;
		is_juv?: boolean;
		record_type: string;
		weight?: number | null;
		wing_length?: number | null;
		capture_time?: string;
		scheme?: string;
		sex?: string;
	}
): Promise<number> {
	const { data, error } = await client
		.from('Encounters')
		.insert({
			capture_time: '10:00:00',
			scheme: 'BTO',
			sex: 'M',
			session_id: sessionId,
			bird_id: birdId,
			...fields
		})
		.select('id')
		.single();
	if (error) throw error;
	return data!.id;
}

/** Returns a ring-number generator producing `${prefix}-0`, `${prefix}-1`, ... */
export function createRingNoSequence(prefix: string): () => string {
	let counter = 0;
	return () => `${prefix}-${counter++}`;
}
