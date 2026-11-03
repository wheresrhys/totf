import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase.types';
import type { DemonRow } from '../types';
import {
	CasualtyEncounterError,
	convertDateFormat,
	isRinglessRingNo,
	normaliseCaptureTime,
	transformEmptyStringsToNull
} from './row-validation';
import { DEFAULT_DEMON_RECORDS_BATCH_SIZE } from './demon-records-batch-writer';
import type {
	createRingSequenceLinker,
	createRingSequenceLookup
} from './ring-sequences';

type SpeciesInsert = Database['public']['Tables']['Species']['Insert'];
type BirdsInsert = Omit<
	Database['public']['Tables']['Birds']['Insert'],
	'last_encountered_timestamp'
>;
type EncountersInsert = Omit<
	Database['public']['Tables']['Encounters']['Insert'],
	'ringing_group_id' | 'max_hatch_year' | 'min_hatch_year'
>;
// Unlike the Encounters/Birds inserts above, nothing is omitted here: Sessions'
// ringing_group_id used to be derived by the trg_set_session_generated_fields
// trigger from Sessions.location_id, and #1024 dropped both, so the import
// writes it itself.
type SessionsInsert = Database['public']['Tables']['Sessions']['Insert'];
type LocationsInsert = Database['public']['Tables']['Locations']['Insert'];

/**
 * Rows per chunk of domain-table writes (#1139).
 *
 * Deliberately the same size as a `DemonRecords` staging batch: a row only
 * reaches this writer once *its* staging batch has landed, so rows arrive in
 * staging-batch-sized waves. An equal chunk size means one wave fills exactly
 * one chunk — no row waits on a later wave before its chunk can flush, and no
 * chunk is cut short by a wave boundary.
 */
export const DEFAULT_ENCOUNTER_ROW_CHUNK_SIZE =
	DEFAULT_DEMON_RECORDS_BATCH_SIZE;

type BufferedEncounterRow = {
	/** Empty-string-normalised, which is what every insert builder below expects. */
	row: DemonRow;
	/** Position in the run, for the chunk-failure log only. */
	rowIndex: number;
	resolve: (result: { visitDate: string }) => void;
	reject: (reason: unknown) => void;
};

/** The id one chunk position's entity of a given type landed on. */
type ChunkEntityIdResolver = (chunkIndex: number) => number;

/**
 * A natural-key tuple flattened into something a `Map` can key on. JSON rather
 * than a joined string so no separator can collide with a value containing it.
 */
function naturalKeyOf(keyValues: unknown[]): string {
	return JSON.stringify(keyValues);
}

/**
 * Follows `encounters_bird_id_location_id_visit_date_unique`, repointed off
 * (bird_id, session_id) in #1024. A session_id key would now mean "one encounter
 * per bird per group per day", silently merging a bird caught at two sites on one
 * day; (bird_id, location_id, visit_date) is what (bird_id, session_id) actually
 * meant while a Session was (date, location, type), so re-importing the same row
 * still updates in place rather than inserting a duplicate.
 */
const ENCOUNTERS_CONFLICT_COLUMNS = [
	'bird_id',
	'location_id',
	'visit_date'
] as (keyof EncountersInsert & string)[];

/**
 * One Session per group per date (#1024). It used to be one per
 * (visit_date, location_id, session_type), where session_type bucketed the row as
 * FULL_GROWN / PULLI / FIELD_OBSERVATION from its own record_type and age — so a
 * group visiting two sites on one day, or ringing both nestlings and full-grown
 * birds at one site, produced several Session rows for the same day. All three of
 * those axes now live on the Encounters rows themselves (location_id/visit_date
 * per #1015, record_type/age_code/is_juv as always), and every read path derives
 * what it needs from there, so a Session is just the group-day the encounters
 * hang off.
 */
const SESSIONS_CONFLICT_COLUMNS = [
	'visit_date',
	'ringing_group_id'
] as (keyof SessionsInsert & string)[];

function buildEncounterInsert(
	row: DemonRow,
	{
		birdId,
		sessionId,
		locationId,
		visitDate
	}: {
		birdId: number;
		sessionId: number;
		locationId: number;
		visitDate: string;
	}
): EncountersInsert {
	return {
		age_code: Number(String(row.age).replace('J', '')),
		breeding_condition: row.breeding_condition as string | null,
		capture_time: normaliseCaptureTime(row.capture_time as string),
		extra_text: row.extra_text as string | null,
		fat: row.fat as string | null,
		finding_condition: row.finding_condition as string | null,
		finding_circumstances: row.finding_circumstances as string | null,
		is_juv: String(row.age).endsWith('J'),
		moult_code: row.moult_code as string | null,
		old_greater_coverts: row.old_greater_coverts
			? Number(row.old_greater_coverts)
			: null,
		pectoral_muscle: row.pectoral_muscle ? Number(row.pectoral_muscle) : null,
		primary_moult: row.primary_moult as string | null,
		record_type: row.record_type as string,
		bird_id: birdId,
		session_id: sessionId,
		// Every encounter carries its own location/date, independent of the
		// Session it is linked to (#1015) — and since #1024 collapsed Sessions to
		// one row per group-day, these are the only place the per-encounter
		// location survives.
		location_id: locationId,
		visit_date: visitDate,
		scheme: row.scheme as string,
		sex: row.sex as string,
		capture_method: row.capture_method as string | null,
		sexing_method: row.sexing_method as string | null,
		weight: row.weight ? Number(row.weight) : null,
		wing_length: row.wing_length ? Number(row.wing_length) : null
	};
}

/**
 * Folds two Encounters rows that collide on
 * `encounters_bird_id_location_id_visit_date_unique` into the single row that
 * should be stored for them (#1219) — a group occasionally records the same
 * bird twice on one group-day at one site, a slip of the pen or a bird logged
 * at the start and the end of a round.
 *
 * One uniform rule: **order the two rows by `capture_time` ascending and take
 * the first non-null value, per column**. The chronologically first record
 * therefore keeps every field it actually recorded — `capture_time` and
 * `record_type` included, both `NOT NULL`, so for those "first non-null" is
 * simply "the earliest row's value" — and any field it left blank is filled in
 * from the later duplicate. Ties on `capture_time` keep `earlierRow`, the one
 * that appeared earlier in the import.
 *
 * Keying the precedence on `capture_time` rather than on arrival order is what
 * makes the rule commutative and associative: a set of duplicates folded
 * pairwise gives the same row whatever order they are folded in, so the result
 * doesn't depend on which chunk happened to reach Postgres first.
 *
 * The conflict-key columns (`bird_id`, `location_id`, `visit_date`) are equal
 * across a duplicate set by definition, and since #1024 collapsed Sessions to
 * one row per group-day `session_id` is equal too, so none of them needs a rule
 * of its own.
 */
export function mergeDuplicateEncounters(
	earlierRow: EncountersInsert,
	laterRow: EncountersInsert
): EncountersInsert {
	const [first, second] =
		laterRow.capture_time < earlierRow.capture_time
			? [laterRow, earlierRow]
			: [earlierRow, laterRow];

	const merged: EncountersInsert = { ...second };
	for (const column of Object.keys(first) as (keyof EncountersInsert)[]) {
		const value = first[column];
		if (value !== null && value !== undefined)
			(merged as Record<string, unknown>)[column] = value;
	}
	return merged;
}

/**
 * What `EncounterRowBatchWriter` accumulates for one Encounters natural key
 * over a whole run, so `reconcileDuplicateEncounters` can rewrite the key once
 * at the end (#1219).
 */
type RunEncounterAccumulation = {
	/** Every contributing row folded together under `mergeDuplicateEncounters`. */
	merged: EncountersInsert;
	/**
	 * The `capture_time`s this run's own CSV rows carried for the key — never a
	 * stored row's. A stored row whose `capture_time` is in here is the same
	 * physical capture event as one of the run's rows, re-imported, so it must
	 * *not* be folded in: the CSV is the newer version of it and a correction
	 * (including a cleared field) has to be allowed to overwrite what's stored.
	 */
	captureTimesWrittenByRun: Set<string>;
	/**
	 * Whether more than one distinct row has contributed, i.e. whether the row
	 * the chunk upserts left behind can differ from `merged`. False for the
	 * overwhelming majority of keys, which one CSV row wrote once.
	 */
	needsRewrite: boolean;
};

/**
 * Interprets CSV rows into the domain tables — Species, Birds, Locations,
 * Sessions, Encounters — a chunk at a time (#1139), rather than five sequential
 * single-row upserts per row.
 *
 * Buffer-then-flush, same shape as `DemonRecordsBatchWriter`: `writeEncounterRow`
 * appends a row and hands back a promise that settles when the chunk containing
 * it has been written, and `flushRemaining` drains the trailing partial chunk.
 * One instance per import run.
 *
 * Within a chunk each entity type is written by exactly one multi-row upsert, in
 * FK dependency order (Species before Birds, Birds/Locations/Sessions before
 * Encounters), with each later upsert's payload carrying the ids the earlier ones
 * resolved. So a chunk of 100 rows costs 5 round trips for these tables instead
 * of 500.
 *
 * Three things the chunking forces, all of which are correctness requirements
 * rather than optimisations:
 *
 * - **Dedup per entity type.** Postgres rejects a multi-row `ON CONFLICT DO
 *   UPDATE` that targets the same conflict key twice ("command cannot affect row
 *   a second time"), and a chunk routinely holds several rows sharing a species,
 *   a location or a date. Each entity type is therefore reduced to one insert per
 *   distinct natural key before its upsert.
 * - **Id resolution by natural key.** A multi-row upsert's returned row order
 *   isn't guaranteed to match the request, so ids are mapped back by the
 *   natural-key columns selected alongside `id`, never by array position.
 * - **Chunk-level failure.** A failed bulk upsert fails every row buffered in
 *   that chunk, matching `DemonRecordsBatchWriter`'s per-batch precedent (#959).
 *   This is a deliberate coarsening of the strictly-per-row failure isolation the
 *   five sequential upserts used to give.
 */
export class EncounterRowBatchWriter {
	private readonly ringingGroupId: number;
	private readonly importJobId: number | undefined;
	private readonly chunkSize: number;
	private readonly lookupRingSequence: ReturnType<
		typeof createRingSequenceLookup
	>;
	private readonly linkRingSequence: ReturnType<
		typeof createRingSequenceLinker
	>;
	private readonly limitChunkFlush: (
		flushChunk: () => Promise<void>
	) => Promise<void>;

	private buffer: BufferedEncounterRow[] = [];
	private rowsBuffered = 0;
	// Chunk flushes run concurrently, governed by `limitChunkFlush` — unlike
	// `DemonRecordsBatchWriter`'s strictly chained batches. That is what keeps the
	// callers' concurrency option meaningful: at `concurrency: 1` the flushes
	// serialize in fill order, which is what `seed-e2e-data.ts`'s deterministic
	// id assignment (#903) depends on, and above 1 they overlap exactly as the
	// per-row domain writes used to.
	private readonly chunkWrites: Promise<void>[] = [];
	// The distinct `Species.id`s actually written by a landed chunk — used to
	// narrow the species-grouped stats-cache refresh (`dispatchStatsCacheRefreshEvents`)
	// to the species an import actually touched, rather than every species the
	// group has ever recorded. A row whose chunk fails, or that never reaches
	// `writeChunk` at all (e.g. a ringless casualty), correctly never contributes.
	private readonly touchedSpeciesIds = new Set<number>();
	// What the run knows about each Encounters natural key it has written to,
	// keyed by `naturalKeyOf(ENCOUNTERS_CONFLICT_COLUMNS)`. Only the keys flagged
	// `needsRewrite` are rewritten by `reconcileDuplicateEncounters` — every
	// other key's stored row is already the single row that belongs there.
	private readonly encounterAccumulationByKey = new Map<
		string,
		RunEncounterAccumulation
	>();

	constructor(
		private readonly supabaseClient: SupabaseClient,
		{
			ringingGroupId,
			lookupRingSequence,
			linkRingSequence,
			importJobId,
			chunkSize = DEFAULT_ENCOUNTER_ROW_CHUNK_SIZE,
			limitChunkFlush = (flushChunk) => flushChunk()
		}: {
			ringingGroupId: number;
			lookupRingSequence: ReturnType<typeof createRingSequenceLookup>;
			linkRingSequence: ReturnType<typeof createRingSequenceLinker>;
			/** The run's `ImportJobs` row, for the chunk-failure log only. */
			importJobId?: number;
			chunkSize?: number;
			/**
			 * Wraps each chunk flush, and is where the run's concurrency cap lives.
			 * Before #1139 the callers' rate limiter capped concurrent *per-row*
			 * domain writes; it now caps concurrent *chunk flushes*, each of which
			 * issues one request at a time (see `linkRingSequencesForChunk`), so it
			 * still caps in-flight requests at roughly the same number.
			 *
			 * It must never wrap `writeEncounterRow` itself, for the same reason the
			 * staging write must stay unthrottled (see `DemonRecordsBatchWriter`): a
			 * chunk only fills if every row can reach the buffer promptly.
			 */
			limitChunkFlush?: (flushChunk: () => Promise<void>) => Promise<void>;
		}
	) {
		this.ringingGroupId = ringingGroupId;
		this.lookupRingSequence = lookupRingSequence;
		this.linkRingSequence = linkRingSequence;
		this.importJobId = importJobId;
		this.chunkSize = chunkSize;
		this.limitChunkFlush = limitChunkFlush;
	}

	/**
	 * One entity type's write for a chunk: reduce the chunk to one insert per
	 * distinct natural key, upsert them all in a single multi-row call, and hand
	 * back a resolver from chunk position to the id that row's entity landed on.
	 *
	 * Deduplication keeps the **last** occurrence's payload at the **first**
	 * occurrence's position, which is what the old row-by-row upserts did: a later
	 * row targeting an earlier row's key updated it in place, so last-write-wins,
	 * while the row order ids were handed out in stayed the CSV's.
	 */
	private async upsertChunkEntities<Insert extends Record<string, unknown>>(
		tableName: string,
		uniqueColumns: (keyof Insert & string)[],
		chunk: BufferedEncounterRow[],
		buildInsert: (
			bufferedRow: BufferedEncounterRow,
			chunkIndex: number
		) => Insert
	): Promise<ChunkEntityIdResolver> {
		const insertPerChunkIndex = chunk.map(buildInsert);
		const keyPerChunkIndex = insertPerChunkIndex.map((insert) =>
			naturalKeyOf(uniqueColumns.map((column) => insert[column]))
		);
		const insertsByKey = new Map<string, Insert>();
		keyPerChunkIndex.forEach((key, chunkIndex) => {
			insertsByKey.set(key, insertPerChunkIndex[chunkIndex]);
		});

		const idsByKey = await this.bulkUpsert(
			tableName,
			uniqueColumns,
			insertsByKey
		);

		return (chunkIndex: number) => {
			const id = idsByKey.get(keyPerChunkIndex[chunkIndex]);
			if (id === undefined)
				throw new Error(
					`Upsert to ${tableName} returned no id for ${keyPerChunkIndex[chunkIndex]}`
				);
			return id;
		};
	}

	/**
	 * The multi-row upsert itself. Same options as the per-row upserter this
	 * replaced (`onConflict` + `ignoreDuplicates: false`), applied to an array, and
	 * selecting the natural-key columns alongside `id` so the returned rows can be
	 * matched back to what was sent.
	 *
	 * Inserts are ordered by natural key rather than by first appearance, so every
	 * concurrent chunk flush locks the rows it conflicts with in the same order and
	 * two overlapping chunks can't deadlock against each other. It stays
	 * deterministic, which is what `concurrency: 1` seeding needs.
	 */
	private async bulkUpsert<Insert extends Record<string, unknown>>(
		tableName: string,
		uniqueColumns: (keyof Insert & string)[],
		insertsByKey: Map<string, Insert>
	): Promise<Map<string, number>> {
		if (insertsByKey.size === 0) return new Map();

		const sortedInserts = [...insertsByKey.entries()]
			.sort(([keyA], [keyB]) => (keyA < keyB ? -1 : keyA > keyB ? 1 : 0))
			.map(([, insert]) => insert);

		const { data, error } = await this.supabaseClient
			.from(tableName)
			.upsert(sortedInserts, {
				onConflict: uniqueColumns.join(','),
				ignoreDuplicates: false
			})
			// The column list is built at runtime, so PostgREST can't infer a row
			// shape from it (it falls back to `GenericStringError`) — the second type
			// argument says what the selected `id` + natural-key columns actually are.
			.select<string, Record<string, unknown>>(
				['id', ...uniqueColumns].join(',')
			);

		if (error) throw error;
		if (!data) throw new Error(`Upsert to ${tableName} returned no data`);

		const idsByKey = new Map<string, number>();
		for (const row of data) {
			const upsertedRow: Record<string, unknown> = row;
			idsByKey.set(
				naturalKeyOf(uniqueColumns.map((column) => upsertedRow[column])),
				upsertedRow.id as number
			);
		}
		return idsByKey;
	}

	/**
	 * The per-row `RingSequences` work, deliberately left un-batched by #1139: the
	 * lookup is a numeric-range match (`prefix` + a `first_index`/`last_index`
	 * window) rather than a keyed upsert, so batching it is a separate problem.
	 *
	 * Only a 'N' (new ring) record assigns a ring to this group for the first time,
	 * so it's the only record_type that looks one up. Any other record_type — and
	 * any 'N' ring with no matching sequence — leaves the bird unlinked for this
	 * group. The link goes through the per-group `RingSequences_Birds` join table
	 * (#703) rather than a group-agnostic FK on the Bird.
	 *
	 * Run one row at a time so a chunk flush still only ever has a single request
	 * in flight, which is what keeps `limitChunkFlush`'s cap a cap on concurrent
	 * requests and not merely on concurrent chunks.
	 */
	private async linkRingSequencesForChunk(
		chunk: BufferedEncounterRow[],
		birdIdOf: ChunkEntityIdResolver
	): Promise<void> {
		for (const [chunkIndex, { row }] of chunk.entries()) {
			if (row.record_type !== 'N') continue;
			const ringSequenceId = await this.lookupRingSequence(
				row.ring_no as string,
				this.ringingGroupId
			);
			if (ringSequenceId === null) continue;
			await this.linkRingSequence(
				birdIdOf(chunkIndex),
				ringSequenceId,
				this.ringingGroupId
			);
		}
	}

	private async writeChunk(chunk: BufferedEncounterRow[]): Promise<void> {
		const speciesIdOf = await this.upsertChunkEntities<SpeciesInsert>(
			'Species',
			['species_name'],
			chunk,
			({ row }) => ({ species_name: row.species_name as string })
		);

		const birdIdOf = await this.upsertChunkEntities<BirdsInsert>(
			'Birds',
			['ring_no'],
			chunk,
			({ row }, chunkIndex) => ({
				ring_no: row.ring_no as string,
				species_id: speciesIdOf(chunkIndex)
			})
		);

		await this.linkRingSequencesForChunk(chunk, birdIdOf);

		const locationIdOf = await this.upsertChunkEntities<LocationsInsert>(
			'Locations',
			['location_name', 'ringing_group_id'],
			chunk,
			({ row }) => ({
				location_name: row.loc_id as string,
				ringing_group_id: this.ringingGroupId
			})
		);

		// ringing_group_id is written explicitly: it used to be derived by the
		// trg_set_session_generated_fields trigger via a Locations lookup on
		// Sessions.location_id, and #1024 retired that trigger along with the column
		// it looked up.
		const sessionIdOf = await this.upsertChunkEntities<SessionsInsert>(
			'Sessions',
			SESSIONS_CONFLICT_COLUMNS,
			chunk,
			({ row }) => ({
				visit_date: convertDateFormat(row.visit_date as string),
				ringing_group_id: this.ringingGroupId
			})
		);

		// Built up front rather than inside `upsertChunkEntities`' callback so the
		// same array can be registered for the run's duplicate reconciliation
		// below: `upsertChunkEntities` reduces a chunk's same-key rows to the last
		// occurrence's payload, which would otherwise hide one half of a
		// same-chunk duplicate pair from that pass entirely.
		const encounterInserts = chunk.map(({ row }, chunkIndex) =>
			buildEncounterInsert(row, {
				birdId: birdIdOf(chunkIndex),
				sessionId: sessionIdOf(chunkIndex),
				locationId: locationIdOf(chunkIndex),
				visitDate: convertDateFormat(row.visit_date as string)
			})
		);

		// Read before the upsert below overwrites them — that is the only moment a
		// row an earlier import left behind is still visible.
		const storedEncounters = await this.readStoredEncounters(encounterInserts);

		await this.upsertChunkEntities<EncountersInsert>(
			'Encounters',
			ENCOUNTERS_CONFLICT_COLUMNS,
			chunk,
			(_bufferedRow, chunkIndex) => encounterInserts[chunkIndex]
		);

		this.registerEncountersForReconciliation(
			encounterInserts,
			storedEncounters
		);

		for (const [chunkIndex, bufferedRow] of chunk.entries()) {
			this.touchedSpeciesIds.add(speciesIdOf(chunkIndex));
			bufferedRow.resolve({
				visitDate: convertDateFormat(bufferedRow.row.visit_date as string)
			});
		}
	}

	/**
	 * The Encounters rows already stored for the natural keys a chunk is about
	 * to write to — the other half of a duplicate pair split across two import
	 * runs (#1219), e.g. a day's ringing uploaded as two CSVs with the same bird
	 * caught at two times in different halves.
	 *
	 * PostgREST has no way to filter on a list of composite keys, so this asks
	 * for the superset `bird_id IN … AND location_id IN … AND visit_date IN …`
	 * and lets `registerEncountersForReconciliation` drop the rows that don't
	 * land on a key of this chunk. A chunk is a contiguous run of one group's
	 * CSV, so its location/date lists are tiny and `idx_encounters_bird_id`
	 * makes the bird list the selective one — the over-fetch is "these birds'
	 * encounters on these few dates", not a cross product of anything large.
	 *
	 * A failure is logged and swallowed rather than thrown: the chunk's own rows
	 * are written either way, and losing the read costs only the cross-run half
	 * of a merge. This read is on every chunk's path, so it must not be able to
	 * fail an import that would otherwise have succeeded.
	 */
	private async readStoredEncounters(
		encounterInserts: EncountersInsert[]
	): Promise<EncountersInsert[]> {
		if (encounterInserts.length === 0) return [];

		const distinct = <Value>(values: Value[]) => [...new Set(values)];
		try {
			const { data, error } = await this.supabaseClient
				.from('Encounters')
				.select<string, EncountersInsert>(
					Object.keys(encounterInserts[0]).join(',')
				)
				.eq('ringing_group_id', this.ringingGroupId)
				.in('bird_id', distinct(encounterInserts.map(({ bird_id }) => bird_id)))
				.in(
					'location_id',
					distinct(encounterInserts.map(({ location_id }) => location_id))
				)
				.in(
					'visit_date',
					distinct(encounterInserts.map(({ visit_date }) => visit_date))
				);

			if (error) throw error;
			return data ?? [];
		} catch (error) {
			console.error(
				'Failed to read stored Encounters rows for duplicate reconciliation; duplicates spanning two import runs will not be merged',
				{
					importJobId: this.importJobId,
					ringingGroupId: this.ringingGroupId,
					chunkRowCount: encounterInserts.length
				},
				error
			);
			return [];
		}
	}

	/**
	 * Folds a landed chunk's Encounters rows — and whatever was stored for their
	 * keys before the chunk overwrote it — into the run's per-natural-key
	 * accumulator, flagging any key more than one distinct row has contributed
	 * to (#1219).
	 *
	 * Called only once the chunk's upsert has returned, so a chunk that failed —
	 * none of whose rows were imported — can never make the wrap-up pass write a
	 * row on its behalf, the same way it never contributes a `touchedSpeciesId`.
	 * The run's own rows are folded before the stored ones so that a stored row
	 * that is merely this chunk's own record re-imported is recognised as such.
	 */
	private registerEncountersForReconciliation(
		encounterInserts: EncountersInsert[],
		storedEncounters: EncountersInsert[]
	): void {
		for (const encounterInsert of encounterInserts)
			this.foldIntoRunAccumulation(encounterInsert, { writtenByRun: true });
		for (const storedEncounter of storedEncounters)
			this.foldIntoRunAccumulation(storedEncounter, { writtenByRun: false });
	}

	private foldIntoRunAccumulation(
		encounterRow: EncountersInsert,
		{ writtenByRun }: { writtenByRun: boolean }
	): void {
		const naturalKey = naturalKeyOf(
			ENCOUNTERS_CONFLICT_COLUMNS.map((column) => encounterRow[column])
		);
		const accumulation = this.encounterAccumulationByKey.get(naturalKey);

		if (!accumulation) {
			// A stored row on a key no row of this run wrote to is over-fetch from
			// `readStoredEncounters`' superset filter — not this chunk's business.
			if (!writtenByRun) return;
			this.encounterAccumulationByKey.set(naturalKey, {
				merged: encounterRow,
				captureTimesWrittenByRun: new Set([encounterRow.capture_time]),
				needsRewrite: false
			});
			return;
		}

		if (writtenByRun)
			accumulation.captureTimesWrittenByRun.add(encounterRow.capture_time);
		// The stored row is the same capture event as one of the run's own rows,
		// imported before: this CSV is the newer version of it, so leave the chunk
		// upsert's overwrite alone rather than merging the superseded values back in.
		else if (
			accumulation.captureTimesWrittenByRun.has(encounterRow.capture_time)
		)
			return;

		accumulation.merged = mergeDuplicateEncounters(
			accumulation.merged,
			encounterRow
		);
		accumulation.needsRewrite = true;
	}

	/**
	 * The run's wrap-up pass (#1219): one multi-row upsert that replaces each
	 * Encounters row more than one distinct record landed on with the merge of
	 * every record that did — the run's own CSV rows, and any row an earlier
	 * import had already stored for the same key. Keys one record wrote to are
	 * left alone, so a typical import issues no extra write at all.
	 *
	 * This is why the merge rule can live in plain TypeScript rather than in a
	 * custom `ON CONFLICT DO UPDATE` inside Postgres. Chunk flushes race each
	 * other (`concurrency: 30` on the web route), so *during* the run the stored
	 * row for a duplicated key is simply whichever chunk landed last — but this
	 * runs once, after `flushRemaining` has awaited every chunk, so there is no
	 * concurrent writer left to lose an update to and no need for the merge to be
	 * atomic with the insert.
	 *
	 * Duplicates are detected from the Encounters rows themselves — what this run
	 * wrote, plus what `readStoredEncounters` found already stored for the same
	 * key — rather than by re-reading `DemonRecords`. Staging is keyed on
	 * `(ringing_group_id, ring_no, encounter_date, encounter_time)`, which omits
	 * the location that `encounters_bird_id_location_id_visit_date_unique`
	 * includes, so a staging query would have to re-resolve
	 * `bird_id`/`location_id`/`session_id` out of `raw_row` just to tell a real
	 * collision from a bird legitimately caught at two sites in one day. The
	 * Encounters rows are already keyed on exactly the constraint being
	 * reconciled.
	 *
	 * A failure here is logged and swallowed rather than thrown: every row of the
	 * import has already been written, and the worst case is that a duplicated
	 * key keeps the last-write-wins row it would have had anyway. Failing the
	 * whole import job over it would misreport a run that did import everything —
	 * the same reasoning `dispatchStatsCacheRefreshEvents` applies to its own
	 * recoverable derived step.
	 *
	 * Only the keys this run wrote to are reconciled, so a duplicate pair that
	 * predates the run entirely stays as it is until one of its rows is
	 * re-imported.
	 */
	private async reconcileDuplicateEncounters(): Promise<void> {
		const mergedEncountersByKey = new Map(
			[...this.encounterAccumulationByKey]
				.filter(([, { needsRewrite }]) => needsRewrite)
				.map(([naturalKey, { merged }]) => [naturalKey, merged])
		);
		if (mergedEncountersByKey.size === 0) return;

		try {
			await this.bulkUpsert(
				'Encounters',
				ENCOUNTERS_CONFLICT_COLUMNS,
				mergedEncountersByKey
			);
		} catch (error) {
			console.error(
				'Failed to reconcile duplicate Encounters rows; each keeps whichever of its duplicates was written last',
				{
					importJobId: this.importJobId,
					ringingGroupId: this.ringingGroupId,
					duplicateKeyCount: mergedEncountersByKey.size
				},
				error
			);
		}
	}

	/**
	 * Rejected rather than thrown: the failure belongs to this chunk's rows, which
	 * each surface it through their own promise, and `flushRemaining` must not blow
	 * up because one chunk did.
	 */
	private failChunk(chunk: BufferedEncounterRow[], error: unknown): void {
		console.error(
			'Failed to write a domain-table chunk; none of its rows were imported',
			{
				importJobId: this.importJobId,
				ringingGroupId: this.ringingGroupId,
				rowCount: chunk.length,
				rowIndices: chunk.map(({ rowIndex }) => rowIndex)
			},
			error
		);
		for (const bufferedRow of chunk) bufferedRow.reject(error);
	}

	private flushBufferedChunk(): void {
		if (this.buffer.length === 0) return;
		const chunk = this.buffer;
		this.buffer = [];
		this.chunkWrites.push(
			(async () => {
				try {
					await this.limitChunkFlush(() => this.writeChunk(chunk));
				} catch (error) {
					this.failChunk(chunk, error);
				}
			})()
		);
	}

	/**
	 * Buffers `rawRow` for the next chunk of domain-table writes and resolves once
	 * the whole chunk containing it has been written — not when it was buffered.
	 *
	 * A casualty record carries no ring number — blank, or DemOn's `'-'` sentinel —
	 * so it has no representable Bird and is filtered out before it can reach a
	 * chunk (where a `'-'`-ringed row would otherwise collide with every other
	 * `'-'`-ringed row in the CSV on `Birds`' unique `ring_no`, tripping the
	 * species-immutability trigger and failing the whole chunk). It rejects
	 * straight away with the same `CasualtyEncounterError` the per-row writer
	 * always threw, which both entry points already distinguish from a genuine
	 * failure.
	 */
	writeEncounterRow(rawRow: DemonRow): Promise<{ visitDate: string }> {
		const row = transformEmptyStringsToNull(rawRow) as DemonRow;
		if (isRinglessRingNo(row.ring_no))
			return Promise.reject(new CasualtyEncounterError());

		const rowIndex = this.rowsBuffered++;
		// The executor runs synchronously, so the row is buffered before this
		// returns — which is what lets a whole chunk fill within one synchronous
		// dispatch pass over the rows released by a staging batch.
		const chunkWritten = new Promise<{ visitDate: string }>(
			(resolve, reject) => {
				this.buffer.push({ row, rowIndex, resolve, reject });
			}
		);
		if (this.buffer.length >= this.chunkSize) this.flushBufferedChunk();
		return chunkWritten;
	}

	/**
	 * Flushes the trailing partial chunk and waits for every chunk of the run to
	 * have been written. Call it once every row has been handed to
	 * `processEncounterRow` — in practice right after the staging writer's own
	 * `flushRemaining` — and before awaiting any row's promise.
	 *
	 * The caller can't simply await the rows first: a row's promise is what settles
	 * when its chunk lands, so awaiting them before flushing would deadlock on the
	 * trailing chunk. Hence the macrotask yield: the rows released by the final
	 * staging batch reach this buffer in microtasks queued by that batch landing,
	 * and the staging writer's `flushRemaining` can resume before the last of them
	 * has run. One macrotask boundary guarantees every such continuation has
	 * executed, so the buffer really does hold the run's trailing chunk.
	 */
	async flushRemaining(): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, 0));
		// Looped, so a row that arrived while an earlier chunk was still in flight
		// can't be left behind in the buffer.
		do {
			this.flushBufferedChunk();
			await Promise.all(this.chunkWrites);
		} while (this.buffer.length > 0);

		// Last, once every chunk of the run has landed and nothing else is still
		// writing to Encounters — that serialisation is what lets the merge be a
		// plain read-free rewrite rather than an atomic DB-side operation.
		await this.reconcileDuplicateEncounters();
	}

	/** The distinct `Species.id`s written by every chunk that has landed so far. */
	getDistinctSpeciesIds(): number[] {
		return [...this.touchedSpeciesIds].sort((a, b) => a - b);
	}
}
