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

/**
 * The location each fixture Session was created *for*.
 *
 * A Session has had no `location_id` of its own since #1024 — it is one row per
 * `(ringing_group_id, visit_date)` — but every `Encounters` row still needs one,
 * and in these fixtures it is almost always the location whose visit the session
 * was created to represent. `insertTestSession` records that here and
 * `insertTestEncounter` reads it back as the default, so a fixture that already
 * said "a session at this location on this date" doesn't have to repeat the
 * location on every encounter it then hangs off it.
 *
 * Deliberately module-level rather than per-resolver: `insertTestSession` is
 * called directly as often as it is through `createSessionResolver`, and session
 * ids are globally unique, so there is nothing to scope it to. Pass an explicit
 * `location_id` to `insertTestEncounter` for the cases this default is wrong —
 * an encounter at a second site on the same group-day, which is exactly the
 * distinction #1024 moved the Encounters uniqueness constraint to preserve.
 */
const fixtureSessionLocations = new Map<number, number>();

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

/**
 * Returns the id of the Sessions row for the group-day a location's visit falls
 * on, inserting it if it doesn't exist yet.
 *
 * Still takes a `locationId` rather than a group id because that's what callers
 * have in hand (and what their Encounters rows need), but a Session is now one
 * row per `(ringing_group_id, visit_date)` (#1024) — it has no location and no
 * session_type of its own. So this looks the location's owning group up and
 * upserts: two different locations visited by one group on one date, or a second
 * call for the same location and date, all resolve to the SAME session. That
 * idempotency isn't a convenience, it's required — a plain insert would trip
 * `Sessions_visit_date_ringing_group_id_key` the second time.
 */
export async function insertTestSession(
	client: SupabaseClient,
	locationId: number,
	visitDate: string
): Promise<number> {
	const { data: location, error: locationError } = await client
		.from('Locations')
		.select('ringing_group_id')
		.eq('id', locationId)
		.single();
	if (locationError) throw locationError;

	const { data, error } = await client
		.from('Sessions')
		.upsert(
			{
				visit_date: visitDate,
				ringing_group_id: location!.ringing_group_id
			},
			{ onConflict: 'visit_date,ringing_group_id' }
		)
		.select('id')
		.single();
	if (error) throw error;
	fixtureSessionLocations.set(data!.id, locationId);
	return data!.id;
}

/**
 * Returns a `getSession` function bound to a fresh cache, keyed by `(date,
 * locationId)` — the "one shared session per (date, location), reused across
 * birds on that date" pattern repeated across nearly every RPC integration
 * test's fixture setup. The session id is pushed onto `track` the first time
 * it's created (never on a cache hit), matching the `afterAll` cleanup
 * convention (`DELETE ... WHERE id IN (${track.join(', ')})`).
 *
 * Two locations of the same group on the same date now share one Session row
 * (#1024), so the cache can hand back the same id under two different keys —
 * and `track` can then list that id twice. Harmless: the cleanup convention is
 * an `IN` list.
 */
export function createSessionResolver() {
	const cache = new Map<string, number>();
	return async function getSession(
		client: SupabaseClient,
		date: string,
		locationId: number,
		track: number[]
	): Promise<number> {
		const key = `${date}|${locationId}`;
		const cached = cache.get(key);
		if (cached !== undefined) return cached;
		const id = await insertTestSession(client, locationId, date);
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
 * `location_id` and `visit_date` are both `NOT NULL` on `Encounters` (#1015) but
 * both default off the session, so a fixture that just wants "an encounter in
 * this session" stays a three-argument call. `visit_date` comes off the Sessions
 * row; `location_id` comes off `fixtureSessionLocations` (see its comment) since
 * #1024 left the Sessions row without one. Pass either in `fields` to make an
 * encounter's own location/date differ from its session's — notably a second
 * location on the same group-day.
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
	const visitDate =
		fields.visit_date ??
		(await readTestSessionDate(client, sessionId)).visit_date;
	const locationId = fields.location_id ?? fixtureSessionLocations.get(sessionId);
	if (locationId === undefined) {
		throw new Error(
			`No location known for session ${sessionId} — create it with insertTestSession/createSessionResolver, or pass location_id explicitly.`
		);
	}

	const { data, error } = await client
		.from('Encounters')
		.insert({
			capture_time: '10:00:00',
			scheme: 'BTO',
			sex: 'M',
			session_id: sessionId,
			bird_id: birdId,
			...fields,
			location_id: locationId,
			visit_date: visitDate
		})
		.select('id')
		.single();
	if (error) throw error;
	return data!.id;
}

/**
 * Reads the `visit_date` of an existing Sessions row, to copy onto an Encounters
 * row built by hand (`Encounters.visit_date` is NOT NULL since #1015). There is
 * no location counterpart: `Sessions.location_id` is gone (#1024), so a
 * hand-built Encounters row has to name its own `location_id`.
 */
export async function readTestSessionDate(
	client: SupabaseClient,
	sessionId: number
): Promise<{ visit_date: string }> {
	const { data, error } = await client
		.from('Sessions')
		.select('visit_date')
		.eq('id', sessionId)
		.single();
	if (error) throw error;
	return data!;
}

type EncounterRowWithSession = {
	session_id: number;
	visit_date?: string;
};

/**
 * The bulk-insert counterpart to `insertTestEncounter`'s session lookup: fills in
 * the `visit_date` every Encounters row needs (NOT NULL since #1015) from the
 * Sessions row each one links to, in one query for the whole batch. Use it where
 * a fixture writes out an array of encounter literals naming only a
 * `session_id`. A row that already names its own date keeps it. Each row must
 * carry its own `location_id` — see `readTestSessionDate`.
 */
export async function withSessionDate<T extends EncounterRowWithSession>(
	client: SupabaseClient,
	rows: T[]
): Promise<(T & { visit_date: string })[]> {
	const sessionIds = [...new Set(rows.map((row) => row.session_id))];
	const { data, error } = await client
		.from('Sessions')
		.select('id, visit_date')
		.in('id', sessionIds);
	if (error) throw error;
	const sessionsById = new Map<number, { visit_date: string }>(
		data!.map((session) => [session.id, session])
	);

	return rows.map((row) => {
		const session = sessionsById.get(row.session_id);
		if (!session) throw new Error(`Session ${row.session_id} not found`);
		return {
			...row,
			visit_date: row.visit_date ?? session.visit_date
		};
	});
}

/** Returns a ring-number generator producing `${prefix}-0`, `${prefix}-1`, ... */
export function createRingNoSequence(prefix: string): () => string {
	let counter = 0;
	return () => `${prefix}-${counter++}`;
}
