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

// Matches DemonRecordsBatchWriter's batch size so one staging wave fills exactly one chunk (#1139).
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

// JSON rather than a joined string, so no separator can collide with a value containing it.
function naturalKeyOf(keyValues: unknown[]): string {
	return JSON.stringify(keyValues);
}

/** `encounters_bird_id_location_id_visit_date_unique`, repointed off (bird_id, session_id) in #1024. */
const ENCOUNTERS_CONFLICT_COLUMNS = [
	'bird_id',
	'location_id',
	'visit_date'
] as (keyof EncountersInsert & string)[];

/** One Session per group per date (#1024) — a Session is just the group-day the encounters hang off. */
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
		// Every encounter carries its own location/date, independent of its Session (#1015).
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
 * Folds two colliding Encounters rows into the single row that should be stored
 * for them (#1219) — orders by `capture_time` ascending and takes the first
 * non-null value per column. See modules/demon-import/CLAUDE.md for why.
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

/** What's accumulated for one Encounters natural key over a run, for `reconcileDuplicateEncounters` (#1219). */
type RunEncounterAccumulation = {
	/** Every contributing row folded together under `mergeDuplicateEncounters`. */
	merged: EncountersInsert;
	/**
	 * This run's own `capture_time`s for the key, never a stored row's — a stored
	 * row matching one of these is a re-import of the same capture, so it must
	 * *not* be folded in: the CSV is the newer version and may legitimately clear
	 * a field.
	 */
	captureTimesWrittenByRun: Set<string>;
	/** Whether more than one distinct row has contributed to this key. */
	needsRewrite: boolean;
};

/**
 * Interprets CSV rows into Species, Birds, Locations, Sessions and Encounters a
 * chunk at a time (#1139), buffer-then-flush like `DemonRecordsBatchWriter`. One
 * instance per import run. See modules/demon-import/CLAUDE.md's "Directory map"
 * for what the chunking forces and why.
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
	// `DemonRecordsBatchWriter`'s strictly chained batches.
	private readonly chunkWrites: Promise<void>[] = [];
	/** The distinct `Species.id`s actually written by a landed chunk, for the species-scoped stats-cache refresh. */
	private readonly touchedSpeciesIds = new Set<number>();
	/** What the run has written to each Encounters natural key so far, for `reconcileDuplicateEncounters`. */
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
			/** Wraps each chunk flush — where the run's concurrency cap lives. Must never wrap `writeEncounterRow` itself. */
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
	 * One entity type's write for a chunk: reduce to one insert per distinct
	 * natural key (last occurrence wins, at the first occurrence's position),
	 * upsert them in one multi-row call, and hand back a chunk-position-to-id
	 * resolver.
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
	 * The multi-row upsert itself, selecting the natural-key columns alongside
	 * `id` so returned rows can be matched back to what was sent. Inserts are
	 * sorted by natural key (not first appearance) so concurrent chunk flushes
	 * lock conflicting rows in the same order and can't deadlock each other.
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
	 * The per-row `RingSequences` work, left un-batched (#1139) since it's a
	 * numeric-range match rather than a keyed upsert. Run one row at a time so a
	 * chunk flush still only ever has a single request in flight.
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
	 * The Encounters rows already stored for the natural keys a chunk is about to
	 * write to — the other half of a duplicate pair split across two import runs
	 * (#1219). PostgREST has no way to filter on a list of composite keys, so
	 * this asks for the superset `bird_id IN … AND location_id IN … AND
	 * visit_date IN …` and lets `registerEncountersForReconciliation` drop the
	 * rows that don't land on a key of this chunk. A failure is logged and
	 * swallowed: it costs only the cross-run half of a merge, not the import.
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
	 * accumulator (#1219). The run's own rows are folded first, so a stored row
	 * that's merely this chunk's own record re-imported is recognised as such.
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
	 * every record that did. Keys one record wrote to are left alone, so a
	 * typical import issues no extra write at all. See
	 * modules/demon-import/CLAUDE.md's "Design choices" for why this runs in
	 * plain TypeScript, once, after every chunk has landed.
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
	 * A casualty record carries no ring number and is filtered out before it can
	 * reach a chunk: a `'-'`-ringed row would otherwise collide with every other
	 * `'-'`-ringed row in the CSV on `Birds`' unique `ring_no`, tripping the
	 * species-immutability trigger and failing the whole chunk.
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
	 * `processEncounterRow`, before awaiting any row's promise.
	 *
	 * The `setTimeout(0)` is a deliberate macrotask yield: rows released by the
	 * final staging batch reach this buffer via microtasks queued by that batch
	 * landing, and the staging writer's own `flushRemaining` can resume before
	 * the last of them has run. One macrotask boundary guarantees they've all
	 * arrived before this flushes the trailing chunk — awaiting the rows first
	 * would deadlock on it instead.
	 */
	async flushRemaining(): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, 0));
		// Looped, so a row that arrived while an earlier chunk was still in flight
		// can't be left behind in the buffer.
		do {
			this.flushBufferedChunk();
			await Promise.all(this.chunkWrites);
		} while (this.buffer.length > 0);

		await this.reconcileDuplicateEncounters();
	}

	/** The distinct `Species.id`s written by every chunk that has landed so far. */
	getDistinctSpeciesIds(): number[] {
		return [...this.touchedSpeciesIds].sort((a, b) => a - b);
	}
}
