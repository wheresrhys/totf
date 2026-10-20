import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	transformEmptyStringsToNull,
	convertDateFormat,
	createUpserter,
	createRingSequenceLookup,
	createRingSequenceLinker,
	DemonRecordsBatchWriter,
	ImportJobTracker,
	CasualtyEncounterError,
	processEncounterRow,
	writeEncounterRow,
	RESIGHTING_RECORD_TYPES,
	getDistinctLocationNames,
	findUnrecognisedLocationNames,
	type DemonRow
} from '../demon-import';

function makeDemonRow(overrides: Partial<DemonRow> = {}): DemonRow {
	return {
		ring_no: 'A123456',
		species_name: 'Blue Tit',
		visit_date: '01/06/2024',
		capture_time: '08:30',
		loc_id: 'Garden Trap',
		age: '5',
		sex: 'M',
		sexing_method: 'P',
		record_type: 'N',
		scheme: 'BTO',
		breeding_condition: '',
		extra_text: '',
		moult_code: '',
		old_greater_coverts: '',
		weight: '10.5',
		wing_length: '65',
		entered_by: '',
		nest_link_code: '',
		validation_comments: '',
		submission_status: '',
		filename: '',
		'new/subsequent': '',
		scheme2: '',
		ring_no2: '',
		pulli_ringed: '',
		pulli_alive: '',
		provisional_sex: '',
		gridref: '',
		habitat_1: '',
		habitat_2: '',
		status_code_1: '',
		status_code_2: '',
		lure_code_1: '',
		lure_code_2: '',
		date_measured: '',
		time_w: '',
		condition: '',
		alula: '',
		primary_moult: '',
		primary_covert_moult_scores: '',
		secondary_moult_scores: '',
		finding_condition: '',
		finding_circumstances: '',
		capture_method: '',
		metal_mark_info: '',
		ringer_initials: '',
		ringer_check_initials: '',
		processor_initials: '',
		extractor_initials: '',
		wing_initials: '',
		colour_mark_info: '',
		metal_mark_position: '',
		fat: '',
		pectoral_muscle: '',
		body_moult: '',
		greater_covert_moult_scores: '',
		alula_moult_scores: '',
		carpal_covert_moult: '',
		wing_point: '',
		primary_length: '',
		bill_length_method: '',
		bill_length: '',
		head_bill_length: '',
		bill_depth_method: '',
		bill_depth: '',
		tarsus_length_method: '',
		tail_moult_scores: '',
		tarsus_length: '',
		tail_length: '',
		claw_length: '',
		plumage: '',
		tail_diff: '',
		lesser_median_covert_moult: '',
		underwing_covert_moult: '',
		head_moult: '',
		upperparts_moult: '',
		underparts_moult: '',
		permit_no: '',
		pullus_stage: '',
		date_accuracy: '',
		left_leg_below: '',
		right_leg_below: '',
		left_leg_above: '',
		right_leg_above: '',
		neck_collar: '',
		left_wing_tag: '',
		right_wing_tag: '',
		nasal_saddle: '',
		sample_processed: '',
		high_tide_time: '',
		finder_name: '',
		own: '',
		own2: '',
		userc1: '',
		userc2: '',
		email: '',
		userc3: '',
		userc4: '',
		userc5: '',
		userv1: '',
		userv2: '',
		userv3: '',
		userv4: '',
		userv5: '',
		l_primary_moult_scores: '',
		l_secondary_moult_scores: '',
		l_tail_moult_scores: '',
		l_primary_covert_moult_scores: '',
		l_greater_covert_moult_scores: '',
		l_carpal_covert_moult: '',
		l_alula_moult_scores: '',
		toe_span: '',
		...overrides
	};
}

describe('RESIGHTING_RECORD_TYPES', () => {
	// Exhaustiveness guard against the public.resighting_record_type enum
	// (#874) — mirrors RING_SIZE_ENUM_ORDER's pinning test for the ring_size
	// enum (app/models/__tests__/ring-sequences.test.ts). A DB-side rename or
	// addition to the enum won't fail this test automatically (there's no
	// runtime link to the DB here), but this is the single by-hand place to
	// update alongside a schema change, per the comment above the constant.
	it('lists exactly the 3 resighting_record_type enum values', () => {
		expect(RESIGHTING_RECORD_TYPES).toHaveLength(3);
		expect(RESIGHTING_RECORD_TYPES).toEqual(['U', 'F', 'D']);
	});
});

describe('transformEmptyStringsToNull', () => {
	it('converts empty strings to null', () => {
		expect(transformEmptyStringsToNull({ a: '', b: 'hello' })).toEqual({
			a: null,
			b: 'hello'
		});
	});

	it('trims whitespace-only strings to null', () => {
		expect(transformEmptyStringsToNull({ a: '  ' })).toEqual({ a: null });
	});

	it('trims whitespace from non-empty strings', () => {
		expect(transformEmptyStringsToNull({ a: ' hello ' })).toEqual({
			a: 'hello'
		});
	});

	it('passes through non-string values unchanged', () => {
		expect(transformEmptyStringsToNull({ a: 42, b: null, c: true })).toEqual({
			a: 42,
			b: null,
			c: true
		});
	});
});

describe('convertDateFormat', () => {
	it('converts DD/MM/YYYY to YYYY-MM-DD', () => {
		expect(convertDateFormat('01/06/2024')).toBe('2024-06-01');
	});
});

describe('getDistinctLocationNames', () => {
	it('returns each loc_id value appearing in the rows, deduplicated', () => {
		const rows = [
			makeDemonRow({ loc_id: 'Garden Trap' }),
			makeDemonRow({ loc_id: 'CES972' }),
			makeDemonRow({ loc_id: 'Garden Trap' })
		];

		expect(getDistinctLocationNames(rows)).toEqual(['Garden Trap', 'CES972']);
	});

	it('ignores rows with an empty or missing loc_id', () => {
		// A surrounding-whitespace-only value is empty once
		// transformEmptyStringsToNull has trimmed it, exactly as it would be for
		// the Location upsert in writeEncounterRow.
		const rows = [
			makeDemonRow({ loc_id: 'Garden Trap' }),
			makeDemonRow({ loc_id: '' }),
			makeDemonRow({ loc_id: '   ' })
		];

		expect(getDistinctLocationNames(rows)).toEqual(['Garden Trap']);
	});
});

describe('findUnrecognisedLocationNames', () => {
	const ALPHA_GROUP_ID = 1;
	const BETA_GROUP_ID = 2;

	// A tiny stand-in for the Locations table, filtered the same way the real
	// PostgREST chain filters: by ringing_group_id, then by name membership.
	function makeClientWithLocations(
		existingLocations: { location_name: string; ringing_group_id: number }[]
	) {
		const mockIn = vi.fn(
			(_column: string, locationNames: string[], groupId = ALPHA_GROUP_ID) =>
				Promise.resolve({
					data: existingLocations
						.filter(
							(location) =>
								location.ringing_group_id === groupId &&
								locationNames.includes(location.location_name)
						)
						.map(({ location_name }) => ({ location_name })),
					error: null
				})
		);
		const mockEq = vi.fn((_column: string, groupId: number) => ({
			in: (column: string, locationNames: string[]) =>
				mockIn(column, locationNames, groupId)
		}));
		const mockSelect = vi.fn(() => ({ eq: mockEq }));
		const mockFrom = vi.fn(() => ({ select: mockSelect }));

		return {
			// eslint-disable-next-line no-restricted-syntax -- mock only implements the `from` chain this test needs, not the full SupabaseClient interface
			client: { from: mockFrom } as unknown as SupabaseClient,
			mockFrom,
			mockEq
		};
	}

	it('returns the subset of names with no matching Locations row for the group', async () => {
		const { client, mockFrom } = makeClientWithLocations([
			{ location_name: 'Garden Trap', ringing_group_id: ALPHA_GROUP_ID }
		]);

		const unrecognised = await findUnrecognisedLocationNames(
			client,
			['Garden Trap', 'CES972', 'Reedbed'],
			ALPHA_GROUP_ID
		);

		expect(mockFrom).toHaveBeenCalledWith('Locations');
		expect(unrecognised).toEqual(['CES972', 'Reedbed']);
	});

	it('returns an empty array when every name already has a matching Locations row', async () => {
		const { client } = makeClientWithLocations([
			{ location_name: 'Garden Trap', ringing_group_id: ALPHA_GROUP_ID },
			{ location_name: 'Reedbed', ringing_group_id: ALPHA_GROUP_ID }
		]);

		await expect(
			findUnrecognisedLocationNames(
				client,
				['Garden Trap', 'Reedbed'],
				ALPHA_GROUP_ID
			)
		).resolves.toEqual([]);
	});

	it("scopes the match to the given ringing_group_id, ignoring another group's matching name", async () => {
		const { client, mockEq } = makeClientWithLocations([
			{ location_name: 'Garden Trap', ringing_group_id: BETA_GROUP_ID }
		]);

		const unrecognised = await findUnrecognisedLocationNames(
			client,
			['Garden Trap'],
			ALPHA_GROUP_ID
		);

		expect(mockEq).toHaveBeenCalledWith('ringing_group_id', ALPHA_GROUP_ID);
		expect(unrecognised).toEqual(['Garden Trap']);
	});

	it('makes no query at all when the CSV named no locations', async () => {
		const { client, mockFrom } = makeClientWithLocations([]);

		await expect(
			findUnrecognisedLocationNames(client, [], ALPHA_GROUP_ID)
		).resolves.toEqual([]);
		expect(mockFrom).not.toHaveBeenCalled();
	});
});

describe('createRingSequenceLookup', () => {
	let mockGte: ReturnType<typeof vi.fn>;
	let mockLte: ReturnType<typeof vi.fn>;
	let mockEqPrefix: ReturnType<typeof vi.fn>;
	let mockEqGroup: ReturnType<typeof vi.fn>;
	let mockSelect: ReturnType<typeof vi.fn>;
	let mockFrom: ReturnType<typeof vi.fn>;
	let lookup: ReturnType<typeof createRingSequenceLookup>;

	beforeEach(() => {
		// Chain: from -> select -> eq(group) -> eq(prefix) -> lte(first_index) ->
		// gte(last_index) -> resolves to { data, error }.
		mockGte = vi.fn();
		mockLte = vi.fn(() => ({ gte: mockGte }));
		mockEqPrefix = vi.fn(() => ({ lte: mockLte }));
		mockEqGroup = vi.fn(() => ({ eq: mockEqPrefix }));
		mockSelect = vi.fn(() => ({ eq: mockEqGroup }));
		mockFrom = vi.fn(() => ({ select: mockSelect }));
		// eslint-disable-next-line no-restricted-syntax -- mock only implements the `from` chain this test needs, not the full SupabaseClient interface
		const mockClient = { from: mockFrom } as unknown as SupabaseClient;
		lookup = createRingSequenceLookup(mockClient);
	});

	it('queries RingSequences filtering by group, the first-3-char prefix, and numeric bounds', async () => {
		mockGte.mockResolvedValue({ data: [{ id: 5 }], error: null });
		await lookup('AEL1699', 7);
		expect(mockFrom).toHaveBeenCalledWith('RingSequences');
		expect(mockSelect).toHaveBeenCalledWith('id');
		expect(mockEqGroup).toHaveBeenCalledWith('ringing_group_id', 7);
		expect(mockEqPrefix).toHaveBeenCalledWith('prefix', 'AEL');
		expect(mockLte).toHaveBeenCalledWith('first_index', 1699);
		expect(mockGte).toHaveBeenCalledWith('last_index', 1699);
	});

	it('takes exactly the first three characters as the prefix comparator', async () => {
		mockGte.mockResolvedValue({ data: [{ id: 5 }], error: null });
		await lookup('ABC123456', 7);
		expect(mockEqPrefix).toHaveBeenCalledWith('prefix', 'ABC');
	});

	it('returns the id of the single matching sequence', async () => {
		mockGte.mockResolvedValue({ data: [{ id: 5 }], error: null });
		expect(await lookup('AEL1699', 7)).toBe(5);
	});

	it('returns null when no sequence matches the prefix and bounds (import leaves the ring unassigned)', async () => {
		mockGte.mockResolvedValue({ data: [], error: null });
		expect(await lookup('AEL1699', 7)).toBeNull();
	});

	it('returns null for an empty ring number without querying', async () => {
		expect(await lookup('', 7)).toBeNull();
		expect(mockFrom).not.toHaveBeenCalled();
	});

	it('returns null for a ring number with no trailing digits without querying', async () => {
		expect(await lookup('ABCDEF', 7)).toBeNull();
		expect(mockFrom).not.toHaveBeenCalled();
	});

	it('throws when the select returns an error', async () => {
		mockGte.mockResolvedValue({
			data: null,
			error: { message: 'select failed' }
		});
		await expect(lookup('AEL1699', 7)).rejects.toMatchObject({
			message: 'select failed'
		});
	});
});

describe('createRingSequenceLinker', () => {
	let mockUpsert: ReturnType<typeof vi.fn>;
	let mockFrom: ReturnType<typeof vi.fn>;
	let link: ReturnType<typeof createRingSequenceLinker>;

	beforeEach(() => {
		mockUpsert = vi.fn().mockResolvedValue({ error: null });
		mockFrom = vi.fn(() => ({ upsert: mockUpsert }));
		// eslint-disable-next-line no-restricted-syntax -- mock only implements the `from` chain this test needs, not the full SupabaseClient interface
		const mockClient = { from: mockFrom } as unknown as SupabaseClient;
		link = createRingSequenceLinker(mockClient);
	});

	it('upserts a RingSequences_Birds row for the bird, sequence and group, ignoring a duplicate on the (bird_id, ring_sequence_id, ringing_group_id) unique constraint', async () => {
		await link(11, 22, 33);
		expect(mockFrom).toHaveBeenCalledWith('RingSequences_Birds');
		expect(mockUpsert).toHaveBeenCalledWith(
			{ bird_id: 11, ring_sequence_id: 22, ringing_group_id: 33 },
			{
				onConflict: 'bird_id,ring_sequence_id,ringing_group_id',
				ignoreDuplicates: true
			}
		);
	});

	it('throws when the upsert returns an error', async () => {
		mockUpsert.mockResolvedValue({ error: { message: 'upsert failed' } });
		await expect(link(11, 22, 33)).rejects.toMatchObject({
			message: 'upsert failed'
		});
	});
});

describe('createUpserter', () => {
	let mockSingle: ReturnType<typeof vi.fn>;
	let mockSelect: ReturnType<typeof vi.fn>;
	let mockUpsertChain: ReturnType<typeof vi.fn>;
	let mockFrom: ReturnType<typeof vi.fn>;
	let upsert: ReturnType<typeof createUpserter>;

	beforeEach(() => {
		mockSingle = vi.fn();
		mockSelect = vi.fn(() => ({ single: mockSingle }));
		mockUpsertChain = vi.fn(() => ({ select: mockSelect }));
		mockFrom = vi.fn(() => ({ upsert: mockUpsertChain }));
		// eslint-disable-next-line no-restricted-syntax -- mock only implements the `from` chain this test needs, not the full SupabaseClient interface
		const mockClient = { from: mockFrom } as unknown as SupabaseClient;
		upsert = createUpserter(mockClient);
	});

	it('calls supabase upsert on the correct table with provided data', async () => {
		mockSingle.mockResolvedValue({ data: { id: 1 }, error: null });
		await upsert('Species', { species_name: 'Robin' }, ['species_name']);
		expect(mockFrom).toHaveBeenCalledWith('Species');
		expect(mockUpsertChain).toHaveBeenCalledWith(
			{ species_name: 'Robin' },
			{ onConflict: 'species_name', ignoreDuplicates: false }
		);
	});

	it('returns the id from the upserted record', async () => {
		mockSingle.mockResolvedValue({ data: { id: 99 }, error: null });
		const result = await upsert('Species', { species_name: 'Robin' }, [
			'species_name'
		]);
		expect(result).toBe(99);
	});

	it('throws when supabase returns an error', async () => {
		mockSingle.mockResolvedValue({
			data: null,
			error: { message: 'conflict error' }
		});
		await expect(
			upsert('Species', { species_name: 'Robin' }, ['species_name'])
		).rejects.toMatchObject({ message: 'conflict error' });
	});
});

describe('ImportJobTracker', () => {
	const IMPORT_JOB_ID = 42;
	const TRACKED_RINGING_GROUP_ID = 7;
	// Every timestamp the tracker writes is `new Date().toISOString()`.
	const ISO_TIMESTAMP = expect.stringMatching(
		/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
	);

	let mockSingle: ReturnType<typeof vi.fn>;
	let mockInsertSelect: ReturnType<typeof vi.fn>;
	let mockInsert: ReturnType<typeof vi.fn>;
	let mockEq: ReturnType<typeof vi.fn>;
	let mockUpdate: ReturnType<typeof vi.fn>;
	let mockFrom: ReturnType<typeof vi.fn>;
	let tracker: ImportJobTracker;

	/**
	 * The one payload handed to `.update()`. Asserted whole rather than per-key, so
	 * a transition touching a column it has no business touching fails the test.
	 */
	function soleUpdatePayload(): Record<string, unknown> {
		expect(mockUpdate).toHaveBeenCalledTimes(1);
		return mockUpdate.mock.calls[0][0];
	}

	beforeEach(() => {
		mockSingle = vi
			.fn()
			.mockResolvedValue({ data: { id: IMPORT_JOB_ID }, error: null });
		mockInsertSelect = vi.fn(() => ({ single: mockSingle }));
		mockInsert = vi.fn(() => ({ select: mockInsertSelect }));
		mockEq = vi.fn().mockResolvedValue({ error: null });
		mockUpdate = vi.fn(() => ({ eq: mockEq }));
		mockFrom = vi.fn(() => ({ insert: mockInsert, update: mockUpdate }));
		tracker = new ImportJobTracker(
			// eslint-disable-next-line no-restricted-syntax -- mock only implements the `from` chain this test needs, not the full SupabaseClient interface
			{ from: mockFrom } as unknown as SupabaseClient
		);
	});

	describe('opening a job at the start of a run', () => {
		it('inserts an in-progress row for the group and returns its id', async () => {
			const importJobId = await tracker.createImportJob(
				TRACKED_RINGING_GROUP_ID
			);

			expect(mockFrom).toHaveBeenCalledWith('ImportJobs');
			expect(mockInsert).toHaveBeenCalledWith({
				ringing_group_id: TRACKED_RINGING_GROUP_ID,
				status: 'in_progress',
				started_at: ISO_TIMESTAMP,
				core_stats_refresh_status: 'in_progress',
				biometrics_stats_refresh_status: 'in_progress',
				demographics_stats_refresh_status: 'in_progress'
			});
			expect(importJobId).toBe(IMPORT_JOB_ID);
		});

		it('throws when the insert fails', async () => {
			mockSingle.mockResolvedValue({
				data: null,
				error: { message: 'insert into ImportJobs denied' }
			});
			await expect(
				tracker.createImportJob(TRACKED_RINGING_GROUP_ID)
			).rejects.toMatchObject({ message: 'insert into ImportJobs denied' });
		});
	});

	describe('recording the batch’s affected dates mid-run', () => {
		it('sets the distinct dates passed in and nothing else', async () => {
			await tracker.recordAffectedDates(IMPORT_JOB_ID, [
				'2024-03-15',
				'2024-03-14',
				'2024-03-15'
			]);

			expect(soleUpdatePayload()).toEqual({
				affected_dates: ['2024-03-14', '2024-03-15']
			});
			expect(mockEq).toHaveBeenCalledWith('id', IMPORT_JOB_ID);
		});

		it('throws when the update fails', async () => {
			mockEq.mockResolvedValue({ error: { message: 'row not visible' } });
			await expect(
				tracker.recordAffectedDates(IMPORT_JOB_ID, ['2024-03-15'])
			).rejects.toMatchObject({ message: 'row not visible' });
		});
	});

	describe('completing a job', () => {
		it('sets succeeded, a finish time and the three row counts', async () => {
			await tracker.completeImportJob(IMPORT_JOB_ID, {
				processed: 10,
				successful: 9,
				failed: 1
			});

			expect(soleUpdatePayload()).toEqual({
				status: 'succeeded',
				finished_at: ISO_TIMESTAMP,
				rows_processed: 10,
				rows_successful: 9,
				rows_failed: 1
			});
		});
	});

	describe('failing a job', () => {
		it('sets failed, a finish time and the error message', async () => {
			await tracker.failImportJob(IMPORT_JOB_ID, 'connection reset');

			expect(soleUpdatePayload()).toEqual({
				status: 'failed',
				finished_at: ISO_TIMESTAMP,
				error_message: 'connection reset'
			});
		});
	});

	describe('marking a job timed out', () => {
		it('sets timed_out, a finish time and the partial progress reported', async () => {
			await tracker.markImportJobTimedOut(IMPORT_JOB_ID, {
				processed: 400,
				startDate: '2024-03-01',
				endDate: '2024-03-15'
			});

			expect(soleUpdatePayload()).toEqual({
				status: 'timed_out',
				finished_at: ISO_TIMESTAMP,
				rows_processed: 400,
				start_date: '2024-03-01',
				end_date: '2024-03-15'
			});
		});
	});

	// One test per stats type, varying only which cache is named — the point of
	// these columns is that each is settable without disturbing the other two or
	// the job's own `status`, which the whole-payload assertion is what proves.
	describe('recording one stats cache’s refresh outcome', () => {
		it('records the core cache on its own column alone', async () => {
			await tracker.markStatsCacheRefreshed(IMPORT_JOB_ID, 'core', 'succeeded');
			expect(soleUpdatePayload()).toEqual({
				core_stats_refresh_status: 'succeeded'
			});
		});

		it('records the biometrics cache on its own column alone', async () => {
			await tracker.markStatsCacheRefreshed(
				IMPORT_JOB_ID,
				'biometrics',
				'succeeded'
			);
			expect(soleUpdatePayload()).toEqual({
				biometrics_stats_refresh_status: 'succeeded'
			});
		});

		it('records the demographics cache on its own column alone', async () => {
			await tracker.markStatsCacheRefreshed(
				IMPORT_JOB_ID,
				'demographics',
				'succeeded'
			);
			expect(soleUpdatePayload()).toEqual({
				demographics_stats_refresh_status: 'succeeded'
			});
		});

		it('records a failed refresh the same way, leaving the job’s own status alone', async () => {
			await tracker.markStatsCacheRefreshed(
				IMPORT_JOB_ID,
				'biometrics',
				'failed'
			);
			expect(soleUpdatePayload()).toEqual({
				biometrics_stats_refresh_status: 'failed'
			});
		});
	});

	describe('a zero-row import', () => {
		it('still opens and completes a job, with zero counts and no affected dates', async () => {
			const importJobId = await tracker.createImportJob(
				TRACKED_RINGING_GROUP_ID
			);
			expect(importJobId).toBe(IMPORT_JOB_ID);

			await tracker.recordAffectedDates(importJobId, []);
			expect(mockUpdate).toHaveBeenNthCalledWith(1, { affected_dates: [] });

			await tracker.completeImportJob(importJobId, {
				processed: 0,
				successful: 0,
				failed: 0
			});
			expect(mockUpdate).toHaveBeenNthCalledWith(2, {
				status: 'succeeded',
				finished_at: ISO_TIMESTAMP,
				rows_processed: 0,
				rows_successful: 0,
				rows_failed: 0
			});
		});
	});
});

const STAGING_IMPORT_JOB_ID = 42;
const STAGING_RINGING_GROUP_ID = 7;

/**
 * Mock Supabase client whose `DemonRecords` upsert settles only when a test says
 * so — which is what makes "has this row's batch landed yet?" directly
 * observable rather than a matter of microtask timing.
 */
function makeDemonRecordsClient() {
	const pendingBatches: ((result: { error: unknown }) => void)[] = [];
	const upsert = vi.fn(
		() =>
			new Promise<{ error: unknown }>((resolve) => {
				pendingBatches.push(resolve);
			})
	);
	const from = vi.fn(() => ({ upsert }));

	return {
		// eslint-disable-next-line no-restricted-syntax -- mock only implements the `from` chain the batch writer uses, not the full SupabaseClient interface
		client: { from } as unknown as SupabaseClient,
		from,
		upsert,
		/** The rows handed to the `callIndex`th (0-based) batch insert. */
		rowsOfBatch: (callIndex = 0) =>
			upsert.mock.calls[callIndex][0] as Record<string, unknown>[],
		/** The upsert options handed to the `callIndex`th batch insert. */
		optionsOfBatch: (callIndex = 0) =>
			upsert.mock.calls[callIndex][1] as Record<string, unknown>,
		// Batches are chained, so the nth insert isn't even issued until the
		// (n-1)th has landed — hence waiting for it to appear before settling it.
		landBatch: async (callIndex = 0) => {
			await settlePendingMicrotasks();
			pendingBatches[callIndex]({ error: null });
			await settlePendingMicrotasks();
		},
		failBatch: async (callIndex: number, error: unknown) => {
			await settlePendingMicrotasks();
			pendingBatches[callIndex]({ error });
			await settlePendingMicrotasks();
		}
	};
}

/**
 * Whether a promise has settled yet, and how — without awaiting it. Handlers are
 * attached synchronously, so a rejection tracked here is never an unhandled one.
 */
function trackSettlement(promise: Promise<unknown>) {
	const settlement: { resolved: boolean; rejectedWith: unknown } = {
		resolved: false,
		rejectedWith: undefined
	};
	promise.then(
		() => {
			settlement.resolved = true;
		},
		(rejectionReason) => {
			settlement.rejectedWith = rejectionReason;
		}
	);
	return settlement;
}

/** Let every already-queued microtask run. */
function settlePendingMicrotasks(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeStagingWriter(batchSize: number) {
	const demonRecordsClient = makeDemonRecordsClient();
	const writer = new DemonRecordsBatchWriter(demonRecordsClient.client, {
		importJobId: STAGING_IMPORT_JOB_ID,
		ringingGroupId: STAGING_RINGING_GROUP_ID,
		batchSize
	});
	return { demonRecordsClient, writer };
}

/** `count` rows, each distinguishable by ring number. */
function makeDemonRows(count: number, overrides: Partial<DemonRow> = {}) {
	return Array.from({ length: count }, (_, rowIndex) =>
		makeDemonRow({
			ring_no: `A${rowIndex.toString().padStart(6, '0')}`,
			...overrides
		})
	);
}

describe('DemonRecordsBatchWriter buffering', () => {
	it('flushes a batch as a single multi-row upsert once writeDemonRecord has been called batchSize times', async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(3);

		for (const row of makeDemonRows(3)) writer.writeDemonRecord(row);
		await settlePendingMicrotasks();

		expect(demonRecordsClient.from).toHaveBeenCalledWith('DemonRecords');
		expect(demonRecordsClient.upsert).toHaveBeenCalledTimes(1);
		expect(demonRecordsClient.rowsOfBatch()).toHaveLength(3);
		expect(demonRecordsClient.rowsOfBatch().map((row) => row.ring_no)).toEqual([
			'A000000',
			'A000001',
			'A000002'
		]);
	});

	it("resolves every row's writeDemonRecord promise together, only once their shared batch has flushed", async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(3);

		const settlements = makeDemonRows(3).map((row) =>
			trackSettlement(writer.writeDemonRecord(row))
		);
		await settlePendingMicrotasks();

		// The insert is in flight, so no row is clear to be interpreted yet.
		expect(settlements.map(({ resolved }) => resolved)).toEqual([
			false,
			false,
			false
		]);

		await demonRecordsClient.landBatch();

		expect(settlements.map(({ resolved }) => resolved)).toEqual([
			true,
			true,
			true
		]);
	});

	it("stamps every row in a flushed batch with the current run's import_job_id and group", async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(2);

		for (const row of makeDemonRows(2)) writer.writeDemonRecord(row);
		await settlePendingMicrotasks();

		for (const stagedRow of demonRecordsClient.rowsOfBatch()) {
			expect(stagedRow.import_job_id).toBe(STAGING_IMPORT_JOB_ID);
			expect(stagedRow.ringing_group_id).toBe(STAGING_RINGING_GROUP_ID);
		}
	});

	it('stages the row essentially verbatim, alongside the dedup key pulled out as real columns', async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(1);

		const rawRow = makeDemonRow({
			ring_no: ' A123456 ',
			visit_date: '15/03/2024',
			capture_time: '08:30'
		});
		writer.writeDemonRecord(rawRow);
		await settlePendingMicrotasks();

		expect(demonRecordsClient.rowsOfBatch()[0]).toMatchObject({
			// Untransformed: a non-lossy copy of what was submitted is the whole
			// point of the table.
			raw_row: rawRow,
			// Trimmed and date-converted, so they match Birds.ring_no /
			// Sessions.visit_date and can take part in the dedup constraint.
			ring_no: 'A123456',
			encounter_date: '2024-03-15',
			encounter_time: '08:30'
		});
	});

	it('applies ON CONFLICT DO NOTHING against the group/ring/date/time dedup key', async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(1);

		writer.writeDemonRecord(makeDemonRow());
		await settlePendingMicrotasks();

		expect(demonRecordsClient.optionsOfBatch()).toEqual({
			onConflict: 'ringing_group_id,ring_no,encounter_date,encounter_time',
			ignoreDuplicates: true
		});
	});

	it('flushRemaining flushes a partial batch smaller than batchSize left over after all rows have been pushed', async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(3);

		const settlements = makeDemonRows(4).map((row) =>
			trackSettlement(writer.writeDemonRecord(row))
		);
		// The first three filled a batch; the fourth is still sitting in the buffer.
		await settlePendingMicrotasks();
		expect(demonRecordsClient.upsert).toHaveBeenCalledTimes(1);

		const flushed = writer.flushRemaining();
		await demonRecordsClient.landBatch(0);

		expect(demonRecordsClient.upsert).toHaveBeenCalledTimes(2);
		expect(demonRecordsClient.rowsOfBatch(1)).toHaveLength(1);

		await demonRecordsClient.landBatch(1);
		await flushed;

		expect(settlements.map(({ resolved }) => resolved)).toEqual([
			true,
			true,
			true,
			true
		]);
	});

	it('getDistinctDates returns the distinct dates across every batch flushed so far', async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(2);

		writer.writeDemonRecord(makeDemonRow({ visit_date: '15/03/2024' }));
		writer.writeDemonRecord(
			makeDemonRow({ ring_no: 'A000001', visit_date: '15/03/2024' })
		);
		writer.writeDemonRecord(
			makeDemonRow({ ring_no: 'A000002', visit_date: '14/03/2024' })
		);
		const flushed = writer.flushRemaining();

		// Nothing has landed yet, so nothing is reportable as durably staged.
		expect(writer.getDistinctDates()).toEqual([]);

		await demonRecordsClient.landBatch(0);
		await demonRecordsClient.landBatch(1);
		await flushed;

		expect(writer.getDistinctDates()).toEqual(['2024-03-14', '2024-03-15']);
	});

	it('skips a row with no ring number, rather than failing its whole batch on a NOT NULL column', async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(2);

		// A casualty record carries no ring number, so it has no representable
		// staging row — it resolves straight away and is left to fail (or not) in
		// the domain-table write as it always did.
		const casualtyRow = trackSettlement(
			writer.writeDemonRecord(makeDemonRow({ ring_no: '' }))
		);
		await settlePendingMicrotasks();
		expect(casualtyRow.resolved).toBe(true);
		expect(demonRecordsClient.upsert).not.toHaveBeenCalled();

		writer.writeDemonRecord(makeDemonRow());
		writer.writeDemonRecord(makeDemonRow({ ring_no: 'A000001' }));
		await settlePendingMicrotasks();

		expect(demonRecordsClient.rowsOfBatch()).toHaveLength(2);
	});

	it('re-staging the same rows (a simulated retry) inserts them again under ON CONFLICT DO NOTHING rather than erroring', async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(2);
		const rows = makeDemonRows(2);

		const firstAttempt = rows.map((row) => writer.writeDemonRecord(row));
		await demonRecordsClient.landBatch(0);
		await Promise.all(firstAttempt);

		const retry = rows.map((row) => writer.writeDemonRecord(row));
		await demonRecordsClient.landBatch(1);
		await expect(Promise.all(retry)).resolves.toBeDefined();

		// Identical payload and identical conflict handling both times — the
		// database, not the writer, is what makes the retry a no-op per row.
		expect(demonRecordsClient.rowsOfBatch(1)).toEqual(
			demonRecordsClient.rowsOfBatch(0)
		);
		expect(demonRecordsClient.optionsOfBatch(1)).toEqual(
			demonRecordsClient.optionsOfBatch(0)
		);
		expect(writer.getDistinctDates()).toEqual(['2024-06-01']);
	});

	it('a batch flush failure rejects every pending promise in that batch', async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(2);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const batchFailure = { message: 'insert into DemonRecords denied' };

		const settlements = makeDemonRows(2).map((row) =>
			trackSettlement(writer.writeDemonRecord(row))
		);
		await demonRecordsClient.failBatch(0, batchFailure);
		await writer.flushRemaining();

		expect(settlements.map(({ rejectedWith }) => rejectedWith)).toEqual([
			batchFailure,
			batchFailure
		]);
		// A failed batch contributes no dates: affected_dates only ever describes
		// what is durably staged.
		expect(writer.getDistinctDates()).toEqual([]);
	});

	it('a batch flush failure is logged with the job, group, row count and row positions', async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(2);
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const batchFailure = { message: 'insert into DemonRecords denied' };

		const settlements = makeDemonRows(2).map((row) =>
			trackSettlement(writer.writeDemonRecord(row))
		);
		await demonRecordsClient.failBatch(0, batchFailure);
		await writer.flushRemaining();

		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining('DemonRecords batch'),
			{
				importJobId: STAGING_IMPORT_JOB_ID,
				ringingGroupId: STAGING_RINGING_GROUP_ID,
				rowCount: 2,
				rowIndices: [0, 1]
			},
			batchFailure
		);
		// Asserted so the rejections above are observed, not unhandled.
		expect(settlements.map(({ rejectedWith }) => rejectedWith)).not.toContain(
			undefined
		);
	});
});

describe('processEncounterRow orchestration', () => {
	it('awaits writeDemonRecord before calling writeEncounterRow for a given row', async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(1);
		const writeEncounterRowRateLimited = vi
			.fn()
			.mockResolvedValue({ visitDate: '2024-06-01' });

		const row = makeDemonRow();
		const processed = processEncounterRow(
			row,
			writer,
			writeEncounterRowRateLimited
		);
		await settlePendingMicrotasks();

		expect(demonRecordsClient.upsert).toHaveBeenCalledTimes(1);
		expect(writeEncounterRowRateLimited).not.toHaveBeenCalled();

		await demonRecordsClient.landBatch();

		await expect(processed).resolves.toEqual({ visitDate: '2024-06-01' });
		expect(writeEncounterRowRateLimited).toHaveBeenCalledWith(row);
	});

	it('a row whose writeDemonRecord promise rejects never reaches writeEncounterRow', async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(1);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const writeEncounterRowRateLimited = vi
			.fn()
			.mockResolvedValue({ visitDate: '2024-06-01' });

		const settlement = trackSettlement(
			processEncounterRow(makeDemonRow(), writer, writeEncounterRowRateLimited)
		);
		await demonRecordsClient.failBatch(0, { message: 'staging write failed' });

		expect(settlement.rejectedWith).toMatchObject({
			message: 'staging write failed'
		});
		expect(writeEncounterRowRateLimited).not.toHaveBeenCalled();
	});

	it('lets an earlier batch’s rows write to the domain tables while a later batch is still in flight', async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(2);
		const writeEncounterRowRateLimited = vi
			.fn()
			.mockResolvedValue({ visitDate: '2024-06-01' });

		const rows = makeDemonRows(4);
		const processed = rows.map((row) =>
			processEncounterRow(row, writer, writeEncounterRowRateLimited)
		);
		const flushed = writer.flushRemaining();

		// Only the first batch has landed; the second is still in flight.
		await demonRecordsClient.landBatch(0);
		await Promise.all(processed.slice(0, 2));

		expect(writeEncounterRowRateLimited).toHaveBeenCalledTimes(2);

		await demonRecordsClient.landBatch(1);
		await flushed;
		await Promise.all(processed);

		expect(writeEncounterRowRateLimited).toHaveBeenCalledTimes(4);
	});

	it("fills a batch larger than the limiter's concurrency cap, because the limiter wraps only writeEncounterRow", async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(3);
		// A limiter that admits one call at a time and never releases it, standing
		// in for a concurrency cap smaller than the batch size. If it wrapped the
		// whole row rather than just the domain-table write, rows 2 and 3 could
		// never reach the buffer and the batch could never fill.
		const admittedToLimiter: DemonRow[] = [];
		const writeEncounterRowRateLimited = (row: DemonRow) => {
			admittedToLimiter.push(row);
			return new Promise<{ visitDate: string }>(() => {});
		};

		for (const row of makeDemonRows(3)) {
			processEncounterRow(row, writer, writeEncounterRowRateLimited);
		}
		await settlePendingMicrotasks();

		expect(demonRecordsClient.upsert).toHaveBeenCalledTimes(1);
		expect(demonRecordsClient.rowsOfBatch()).toHaveLength(3);

		await demonRecordsClient.landBatch();

		expect(admittedToLimiter).toHaveLength(3);
	});
});

describe('writeEncounterRow', () => {
	const RINGING_GROUP_ID = 7;
	const RESOLVED_RING_SEQUENCE_ID = 555;
	let upsert: ReturnType<typeof vi.fn>;
	let lookupRingSequence: ReturnType<typeof vi.fn>;
	let linkRingSequence: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		let callCount = 0;
		upsert = vi.fn().mockImplementation(() => {
			callCount++;
			return Promise.resolve(callCount * 10);
		});
		lookupRingSequence = vi.fn().mockResolvedValue(RESOLVED_RING_SEQUENCE_ID);
		linkRingSequence = vi.fn().mockResolvedValue(undefined);
	});

	describe('casualty encounters', () => {
		it('throws CasualtyEncounterError and does not call upsert when ring_no is empty', async () => {
			const row = makeDemonRow({ ring_no: '' });
			await expect(
				writeEncounterRow(
					row,
					upsert,
					lookupRingSequence,
					RINGING_GROUP_ID,
					linkRingSequence
				)
			).rejects.toBeInstanceOf(CasualtyEncounterError);
			expect(upsert).not.toHaveBeenCalled();
		});

		it('processes normally when ring_no is present (already-ringed bird)', async () => {
			const row = makeDemonRow({ ring_no: 'A123456' });
			await expect(
				writeEncounterRow(
					row,
					upsert,
					lookupRingSequence,
					RINGING_GROUP_ID,
					linkRingSequence
				)
			).resolves.toBeDefined();
			expect(upsert).toHaveBeenCalled();
		});
	});

	it('upserts Species with the species name', async () => {
		const row = makeDemonRow({ species_name: 'Blue Tit' });
		await writeEncounterRow(
			row,
			upsert,
			lookupRingSequence,
			RINGING_GROUP_ID,
			linkRingSequence
		);
		expect(upsert).toHaveBeenCalledWith(
			'Species',
			{ species_name: 'Blue Tit' },
			['species_name']
		);
	});

	it('upserts Bird with ring_no and the species ID from Species upsert (ring-sequence linkage is a separate write, not part of this payload)', async () => {
		const row = makeDemonRow({
			ring_no: 'A123456',
			species_name: 'Blue Tit',
			record_type: 'N'
		});
		await writeEncounterRow(
			row,
			upsert,
			lookupRingSequence,
			RINGING_GROUP_ID,
			linkRingSequence
		);
		const speciesId = 10; // first call returns 10
		expect(upsert).toHaveBeenCalledWith(
			'Birds',
			{
				ring_no: 'A123456',
				species_id: speciesId
			},
			['ring_no']
		);
	});

	it('upserts Location with loc_id and ringing group ID', async () => {
		const row = makeDemonRow({ loc_id: 'Garden Trap' });
		await writeEncounterRow(
			row,
			upsert,
			lookupRingSequence,
			RINGING_GROUP_ID,
			linkRingSequence
		);
		expect(upsert).toHaveBeenCalledWith(
			'Locations',
			{ location_name: 'Garden Trap', ringing_group_id: RINGING_GROUP_ID },
			['location_name', 'ringing_group_id']
		);
	});

	// The old (visit_date, location_id, session_type) key and the record_type/age
	// bucketing that computed session_type are both gone (#1024) — a Session is one
	// row per group-day now, and the whole `session_type bucketing` describe block
	// that used to sit here went with the column it asserted on.
	describe('Sessions upsert', () => {
		function sessionUpsertCall() {
			return upsert.mock.calls.find(([table]) => table === 'Sessions');
		}

		it('upserts Session with the converted visit_date and the importing group', async () => {
			await writeEncounterRow(
				makeDemonRow({ visit_date: '15/03/2023' }),
				upsert,
				lookupRingSequence,
				RINGING_GROUP_ID,
				linkRingSequence
			);
			expect(upsert).toHaveBeenCalledWith(
				'Sessions',
				{
					visit_date: '2023-03-15',
					ringing_group_id: RINGING_GROUP_ID
				},
				['visit_date', 'ringing_group_id']
			);
		});

		it('writes no location_id or session_type onto the Session, whatever the row looks like', async () => {
			await writeEncounterRow(
				makeDemonRow({ record_type: 'U', age: '1' }),
				upsert,
				lookupRingSequence,
				RINGING_GROUP_ID,
				linkRingSequence
			);
			expect(sessionUpsertCall()?.[1]).not.toHaveProperty('location_id');
			expect(sessionUpsertCall()?.[1]).not.toHaveProperty('session_type');
		});
	});

	it('upserts Encounter with bird and session IDs from prior upserts', async () => {
		const row = makeDemonRow({
			capture_time: '09:15',
			record_type: 'N',
			scheme: 'BTO',
			sex: 'F',
			sexing_method: 'P',
			age: '5',
			weight: '11.2',
			wing_length: '67',
			old_greater_coverts: '3',
			moult_code: 'M',
			breeding_condition: 'B',
			extra_text: 'some note',
			finding_condition: '8',
			finding_circumstances: '2',
			primary_moult: 'FF',
			fat: 'B4',
			pectoral_muscle: '2',
			capture_method: 'M'
		});
		await writeEncounterRow(
			row,
			upsert,
			lookupRingSequence,
			RINGING_GROUP_ID,
			linkRingSequence
		);
		const birdId = 20; // second call returns 20
		const sessionId = 40; // fourth call returns 40
		expect(upsert).toHaveBeenCalledWith(
			'Encounters',
			expect.objectContaining({
				bird_id: birdId,
				session_id: sessionId,
				capture_time: '09:15',
				record_type: 'N',
				scheme: 'BTO',
				sex: 'F',
				sexing_method: 'P',
				age_code: 5,
				is_juv: false,
				weight: 11.2,
				wing_length: 67,
				old_greater_coverts: 3,
				moult_code: 'M',
				breeding_condition: 'B',
				extra_text: 'some note',
				finding_condition: '8',
				finding_circumstances: '2',
				primary_moult: 'FF',
				fat: 'B4',
				pectoral_muscle: 2,
				capture_method: 'M'
			}),
			['bird_id', 'location_id', 'visit_date']
		);
	});

	it('converts empty string fields to null in Encounter', async () => {
		const row = makeDemonRow({
			breeding_condition: '',
			moult_code: '',
			extra_text: '',
			sexing_method: '',
			weight: '',
			wing_length: '',
			old_greater_coverts: '',
			finding_condition: '',
			finding_circumstances: '',
			primary_moult: '',
			fat: '',
			pectoral_muscle: '',
			capture_method: ''
		});
		await writeEncounterRow(
			row,
			upsert,
			lookupRingSequence,
			RINGING_GROUP_ID,
			linkRingSequence
		);
		expect(upsert).toHaveBeenCalledWith(
			'Encounters',
			expect.objectContaining({
				breeding_condition: null,
				moult_code: null,
				extra_text: null,
				sexing_method: null,
				weight: null,
				wing_length: null,
				old_greater_coverts: null,
				finding_condition: null,
				finding_circumstances: null,
				primary_moult: null,
				fat: null,
				pectoral_muscle: null,
				capture_method: null
			}),
			['bird_id', 'location_id', 'visit_date']
		);
	});

	it('parses juvenile age codes (e.g. "3J") into age_code and is_juv', async () => {
		const row = makeDemonRow({ age: '3J' });
		await writeEncounterRow(
			row,
			upsert,
			lookupRingSequence,
			RINGING_GROUP_ID,
			linkRingSequence
		);
		expect(upsert).toHaveBeenCalledWith(
			'Encounters',
			expect.objectContaining({ age_code: 3, is_juv: true }),
			['bird_id', 'location_id', 'visit_date']
		);
	});

	it('parses non-juvenile age codes into age_code and is_juv: false', async () => {
		const row = makeDemonRow({ age: '6' });
		await writeEncounterRow(
			row,
			upsert,
			lookupRingSequence,
			RINGING_GROUP_ID,
			linkRingSequence
		);
		expect(upsert).toHaveBeenCalledWith(
			'Encounters',
			expect.objectContaining({ age_code: 6, is_juv: false }),
			['bird_id', 'location_id', 'visit_date']
		);
	});

	it('returns the converted visit date', async () => {
		const row = makeDemonRow({ visit_date: '22/11/2022' });
		const result = await writeEncounterRow(
			row,
			upsert,
			lookupRingSequence,
			RINGING_GROUP_ID,
			linkRingSequence
		);
		expect(result.visitDate).toBe('2022-11-22');
	});

	it('calls upsert exactly 5 times (Species, Birds, Locations, Sessions, Encounters) — the lookup is a separate injected function, not routed through upsert', async () => {
		const row = makeDemonRow();
		await writeEncounterRow(
			row,
			upsert,
			lookupRingSequence,
			RINGING_GROUP_ID,
			linkRingSequence
		);
		expect(upsert).toHaveBeenCalledTimes(5);
	});

	describe('RingSequences (record_type "N")', () => {
		it('looks up the matching RingSequences row by full ring number and links the bird to it for this group via linkRingSequence', async () => {
			const row = makeDemonRow({ ring_no: 'AEL1699', record_type: 'N' });
			await writeEncounterRow(
				row,
				upsert,
				lookupRingSequence,
				RINGING_GROUP_ID,
				linkRingSequence
			);
			expect(lookupRingSequence).toHaveBeenCalledWith(
				'AEL1699',
				RINGING_GROUP_ID
			);
			const birdId = 20; // second call (Birds) returns 20
			expect(linkRingSequence).toHaveBeenCalledWith(
				birdId,
				RESOLVED_RING_SEQUENCE_ID,
				RINGING_GROUP_ID
			);
		});

		it.each(['S', 'C', 'U', 'F', 'D'])(
			'does not look up a RingSequences row or call linkRingSequence for a non-N record_type (%s)',
			async (recordType) => {
				const row = makeDemonRow({
					ring_no: 'AEL1699',
					record_type: recordType
				});
				await writeEncounterRow(
					row,
					upsert,
					lookupRingSequence,
					RINGING_GROUP_ID,
					linkRingSequence
				);
				expect(lookupRingSequence).not.toHaveBeenCalled();
				expect(linkRingSequence).not.toHaveBeenCalled();
			}
		);

		it('does not call linkRingSequence when no sequence matches (lookup returns null)', async () => {
			lookupRingSequence.mockResolvedValueOnce(null);
			const row = makeDemonRow({ ring_no: 'AEL1699', record_type: 'N' });
			await writeEncounterRow(
				row,
				upsert,
				lookupRingSequence,
				RINGING_GROUP_ID,
				linkRingSequence
			);
			expect(lookupRingSequence).toHaveBeenCalledWith(
				'AEL1699',
				RINGING_GROUP_ID
			);
			expect(linkRingSequence).not.toHaveBeenCalled();
		});

		it('calls lookupRingSequence exactly once per N row', async () => {
			const row = makeDemonRow({ ring_no: 'AEL1699', record_type: 'N' });
			await writeEncounterRow(
				row,
				upsert,
				lookupRingSequence,
				RINGING_GROUP_ID,
				linkRingSequence
			);
			expect(lookupRingSequence).toHaveBeenCalledTimes(1);
		});
	});
});
