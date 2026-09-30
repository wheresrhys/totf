/**
 * Shared encounter-seeding building blocks for the RPC integration test suites
 * under `supabase/__tests__/rpc-functions/` (plus, for the two session-lookup
 * helpers at the bottom, any integration test that builds an Encounters row by
 * hand — `app/actions/__tests__/ring-sequences.test.ts` included).
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
 *
 * `location_id`/`visit_date` are `NOT NULL` on `Encounters` (#1015) but are read
 * off the session by default, so a fixture that just wants "an encounter in this
 * session" stays a three-argument call. Pass either in `fields` to make an
 * encounter's own location/date differ from its session's.
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
		location_id?: number;
		visit_date?: string;
	}
): Promise<number> {
	const session =
		fields.location_id === undefined || fields.visit_date === undefined
			? await readTestSessionLocationAndDate(client, sessionId)
			: undefined;

	const { data, error } = await client
		.from('Encounters')
		.insert({
			capture_time: '10:00:00',
			scheme: 'BTO',
			sex: 'M',
			session_id: sessionId,
			bird_id: birdId,
			...fields,
			location_id: fields.location_id ?? session!.location_id,
			visit_date: fields.visit_date ?? session!.visit_date
		})
		.select('id')
		.single();
	if (error) throw error;
	return data!.id;
}

/**
 * Reads the `location_id`/`visit_date` of an existing Sessions row, to copy onto an
 * Encounters row built by hand (both are NOT NULL on `Encounters` since #1015).
 */
export async function readTestSessionLocationAndDate(
	client: SupabaseClient,
	sessionId: number
): Promise<{ location_id: number; visit_date: string }> {
	const { data, error } = await client
		.from('Sessions')
		.select('location_id, visit_date')
		.eq('id', sessionId)
		.single();
	if (error) throw error;
	return data!;
}

type EncounterRowWithSession = {
	session_id: number;
	location_id?: number;
	visit_date?: string;
};

/**
 * The bulk-insert counterpart to `insertTestEncounter`'s session lookup: fills in
 * the `location_id`/`visit_date` every Encounters row needs (both NOT NULL since
 * #1015) from the Sessions row each one links to, in one query for the whole batch.
 * Use it where a fixture writes out an array of encounter literals naming only a
 * `session_id`. A row that already names its own location/date keeps it.
 */
export async function withSessionLocationAndDate<T extends EncounterRowWithSession>(
	client: SupabaseClient,
	rows: T[]
): Promise<(T & { location_id: number; visit_date: string })[]> {
	const sessionIds = [...new Set(rows.map((row) => row.session_id))];
	const { data, error } = await client
		.from('Sessions')
		.select('id, location_id, visit_date')
		.in('id', sessionIds);
	if (error) throw error;
	const sessionsById = new Map<number, { location_id: number; visit_date: string }>(
		data!.map((session) => [session.id, session])
	);

	return rows.map((row) => {
		const session = sessionsById.get(row.session_id);
		if (!session) throw new Error(`Session ${row.session_id} not found`);
		return {
			...row,
			location_id: row.location_id ?? session.location_id,
			visit_date: row.visit_date ?? session.visit_date
		};
	});
}

/** Returns a ring-number generator producing `${prefix}-0`, `${prefix}-1`, ... */
export function createRingNoSequence(prefix: string): () => string {
	let counter = 0;
	return () => `${prefix}-${counter++}`;
}
