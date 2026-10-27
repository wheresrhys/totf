import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	transformEmptyStringsToNull,
	isRinglessRingNo,
	convertDateFormat,
	createRingSequenceLookup,
	createRingSequenceLinker,
	DemonRecordsBatchWriter,
	EncounterRowBatchWriter,
	ImportJobTracker,
	CasualtyEncounterError,
	mergeDuplicateEncounters,
	processEncounterRow,
	dispatchStatsCacheRefreshEvents,
	RESIGHTING_RECORD_TYPES,
	getDistinctLocationNames,
	findUnrecognisedLocationNames,
	type DemonRow
} from '../demon-import';
import { buildStatsCacheRefreshEvents } from '../stats-cache-refresh-events';
import { dispatchStatsCacheRefreshWindow } from '../queue-dispatch';

vi.mock('../stats-cache-refresh-events', () => ({
	buildStatsCacheRefreshEvents: vi.fn()
}));

vi.mock('../queue-dispatch', () => ({
	dispatchStatsCacheRefreshWindow: vi.fn()
}));

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

describe('isRinglessRingNo', () => {
	it('returns true for null, undefined and empty string', () => {
		expect(isRinglessRingNo(null)).toBe(true);
		expect(isRinglessRingNo(undefined)).toBe(true);
		expect(isRinglessRingNo('')).toBe(true);
	});

	it("returns true for the '-' casualty sentinel", () => {
		expect(isRinglessRingNo('-')).toBe(true);
	});

	it("returns true for '-' with surrounding whitespace", () => {
		expect(isRinglessRingNo(' - ')).toBe(true);
	});

	it('returns false for a real ring number', () => {
		expect(isRinglessRingNo('A000001')).toBe(false);
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
				day_stats_refresh_status: 'in_progress',
				month_stats_refresh_status: 'in_progress',
				year_stats_refresh_status: 'in_progress',
				month_squashed_stats_refresh_status: 'in_progress',
				all_time_stats_refresh_status: 'in_progress'
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

	// One test per temporal unit, varying only which unit is named — the point of
	// these columns is that each is settable without disturbing the other four or
	// the job's own `status`, which the whole-payload assertion is what proves.
	describe('recording one temporal unit’s refresh outcome', () => {
		it('records the day temporal unit on its own column alone', async () => {
			await tracker.markStatsCacheRefreshed(IMPORT_JOB_ID, 'day', 'succeeded');
			expect(soleUpdatePayload()).toEqual({
				day_stats_refresh_status: 'succeeded'
			});
		});

		it('records the month temporal unit on its own column alone', async () => {
			await tracker.markStatsCacheRefreshed(
				IMPORT_JOB_ID,
				'month',
				'succeeded'
			);
			expect(soleUpdatePayload()).toEqual({
				month_stats_refresh_status: 'succeeded'
			});
		});

		it('records the year temporal unit on its own column alone', async () => {
			await tracker.markStatsCacheRefreshed(IMPORT_JOB_ID, 'year', 'succeeded');
			expect(soleUpdatePayload()).toEqual({
				year_stats_refresh_status: 'succeeded'
			});
		});

		it('records the month-squashed temporal unit on its own column alone', async () => {
			await tracker.markStatsCacheRefreshed(
				IMPORT_JOB_ID,
				'month-squashed',
				'succeeded'
			);
			expect(soleUpdatePayload()).toEqual({
				month_squashed_stats_refresh_status: 'succeeded'
			});
		});

		it('records the all-time temporal unit on its own column alone', async () => {
			await tracker.markStatsCacheRefreshed(
				IMPORT_JOB_ID,
				'all-time',
				'succeeded'
			);
			expect(soleUpdatePayload()).toEqual({
				all_time_stats_refresh_status: 'succeeded'
			});
		});

		it('records a failed refresh the same way, leaving the job’s own status alone', async () => {
			await tracker.markStatsCacheRefreshed(IMPORT_JOB_ID, 'month', 'failed');
			expect(soleUpdatePayload()).toEqual({
				month_stats_refresh_status: 'failed'
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

	it("skips a row whose ring number is the '-' casualty sentinel, rather than failing its whole batch", async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(2);

		const casualtyRow = trackSettlement(
			writer.writeDemonRecord(makeDemonRow({ ring_no: '-' }))
		);
		const whitespaceCasualtyRow = trackSettlement(
			writer.writeDemonRecord(makeDemonRow({ ring_no: ' - ' }))
		);
		await settlePendingMicrotasks();
		expect(casualtyRow.resolved).toBe(true);
		expect(whitespaceCasualtyRow.resolved).toBe(true);
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

const DOMAIN_RINGING_GROUP_ID = 7;
const DOMAIN_IMPORT_JOB_ID = 42;

/**
 * Distinct id ranges per table, so an id that has been routed onto the wrong
 * column is obvious from a failure message rather than a plausible-looking `1`.
 */
const MOCK_ID_BASE: Record<string, number> = {
	Species: 100,
	Birds: 200,
	Locations: 300,
	Sessions: 400,
	Encounters: 500
};

/**
 * Mock Supabase client for the domain-table writer: records every bulk upsert and
 * answers it with the natural-key columns it was asked to select plus a
 * table-scoped id, exactly as PostgREST would — which is what lets a test assert
 * that a later entity's payload carries the id an earlier one actually resolved.
 */
function makeDomainTablesClient() {
	const upsertCalls: {
		table: string;
		rows: Record<string, unknown>[];
		options: Record<string, unknown>;
		selectedColumns: string[];
	}[] = [];
	const idsByTableAndKey = new Map<string, number>();
	const nextIdByTable: Record<string, number> = {};
	let failingTable: string | null = null;
	let failure: unknown = null;
	let reverseResponseRows = false;

	/** A stable id per (table, natural key), minted in the order rows are seen. */
	function idFor(table: string, naturalKey: string): number {
		const mapKey = `${table}|${naturalKey}`;
		const existingId = idsByTableAndKey.get(mapKey);
		if (existingId !== undefined) return existingId;
		const mintedId = (nextIdByTable[table] ?? MOCK_ID_BASE[table]) + 1;
		nextIdByTable[table] = mintedId;
		idsByTableAndKey.set(mapKey, mintedId);
		return mintedId;
	}

	function respondTo(
		table: string,
		rows: Record<string, unknown>[],
		selectedColumns: string[]
	) {
		const keyColumns = selectedColumns.filter((column) => column !== 'id');
		const data = rows.map((row) => {
			const echoedRow: Record<string, unknown> = {
				id: idFor(
					table,
					JSON.stringify(keyColumns.map((column) => row[column]))
				)
			};
			for (const column of keyColumns) echoedRow[column] = row[column];
			return echoedRow;
		});
		return reverseResponseRows ? data.reverse() : data;
	}

	const from = vi.fn((table: string) => ({
		upsert: (
			rows: Record<string, unknown>[],
			options: Record<string, unknown>
		) => ({
			select: (selectedColumnList: string) => {
				const selectedColumns = selectedColumnList.split(',');
				upsertCalls.push({ table, rows, options, selectedColumns });
				if (failingTable === table)
					return Promise.resolve({ data: null, error: failure });
				return Promise.resolve({
					data: respondTo(table, rows, selectedColumns),
					error: null
				});
			}
		})
	}));

	return {
		// eslint-disable-next-line no-restricted-syntax -- mock only implements the `from` chain the batch writer uses, not the full SupabaseClient interface
		client: { from } as unknown as SupabaseClient,
		upsertCalls,
		/** Which tables were upserted into, in the order the calls were made. */
		tablesInCallOrder: () => upsertCalls.map(({ table }) => table),
		/** The rows of the first (usually only) bulk upsert into `table`. */
		rowsUpsertedInto: (table: string) =>
			upsertCalls.find((call) => call.table === table)?.rows ?? [],
		/** The id this client answered with for one natural key — assert against it. */
		idFor: (table: string, ...keyValues: unknown[]) =>
			idFor(table, JSON.stringify(keyValues)),
		failOn: (table: string, error: unknown) => {
			failingTable = table;
			failure = error;
		},
		/** Answer every upsert with its rows in reverse request order. */
		reverseResponses: () => {
			reverseResponseRows = true;
		}
	};
}

function makeEncounterRowWriter({
	chunkSize = 2,
	ringSequenceId = null,
	limitChunkFlush
}: {
	chunkSize?: number;
	ringSequenceId?: number | null;
	limitChunkFlush?: (flushChunk: () => Promise<void>) => Promise<void>;
} = {}) {
	const domainTablesClient = makeDomainTablesClient();
	const lookupRingSequence = vi.fn().mockResolvedValue(ringSequenceId);
	const linkRingSequence = vi.fn().mockResolvedValue(undefined);
	const writer = new EncounterRowBatchWriter(domainTablesClient.client, {
		ringingGroupId: DOMAIN_RINGING_GROUP_ID,
		importJobId: DOMAIN_IMPORT_JOB_ID,
		lookupRingSequence,
		linkRingSequence,
		chunkSize,
		limitChunkFlush
	});
	return { domainTablesClient, writer, lookupRingSequence, linkRingSequence };
}

/** A limiter that admits every chunk flush but never lets one run. */
function neverRunningChunkLimiter() {
	const flushesAdmitted: (() => Promise<void>)[] = [];
	return {
		flushesAdmitted,
		limitChunkFlush: (flushChunk: () => Promise<void>) => {
			flushesAdmitted.push(flushChunk);
			return new Promise<void>(() => {});
		}
	};
}

describe('processEncounterRow orchestration', () => {
	it('awaits writeDemonRecord before handing the row to the domain-table writer', async () => {
		const { demonRecordsClient, writer: stagingWriter } = makeStagingWriter(1);
		const { writer: encounterRowBatchWriter } = makeEncounterRowWriter({
			chunkSize: 1
		});
		const writeEncounterRow = vi.spyOn(
			encounterRowBatchWriter,
			'writeEncounterRow'
		);

		const row = makeDemonRow();
		const processed = processEncounterRow(
			row,
			stagingWriter,
			encounterRowBatchWriter
		);
		await settlePendingMicrotasks();

		expect(demonRecordsClient.upsert).toHaveBeenCalledTimes(1);
		expect(writeEncounterRow).not.toHaveBeenCalled();

		await demonRecordsClient.landBatch();

		await expect(processed).resolves.toEqual({ visitDate: '2024-06-01' });
		expect(writeEncounterRow).toHaveBeenCalledWith(row);
	});

	it('a row whose writeDemonRecord promise rejects never reaches the domain-table writer', async () => {
		const { demonRecordsClient, writer: stagingWriter } = makeStagingWriter(1);
		const { writer: encounterRowBatchWriter } = makeEncounterRowWriter({
			chunkSize: 1
		});
		const writeEncounterRow = vi.spyOn(
			encounterRowBatchWriter,
			'writeEncounterRow'
		);
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const settlement = trackSettlement(
			processEncounterRow(
				makeDemonRow(),
				stagingWriter,
				encounterRowBatchWriter
			)
		);
		await demonRecordsClient.failBatch(0, { message: 'staging write failed' });

		expect(settlement.rejectedWith).toMatchObject({
			message: 'staging write failed'
		});
		expect(writeEncounterRow).not.toHaveBeenCalled();
	});

	it('lets an earlier batch’s rows write to the domain tables while a later batch is still in flight', async () => {
		const { demonRecordsClient, writer: stagingWriter } = makeStagingWriter(2);
		const { writer: encounterRowBatchWriter, domainTablesClient } =
			makeEncounterRowWriter({ chunkSize: 2 });

		const rows = makeDemonRows(4);
		const processed = rows.map((row) =>
			processEncounterRow(row, stagingWriter, encounterRowBatchWriter)
		);
		const flushed = stagingWriter.flushRemaining();

		// Only the first batch has landed; the second is still in flight.
		await demonRecordsClient.landBatch(0);
		await Promise.all(processed.slice(0, 2));

		expect(domainTablesClient.rowsUpsertedInto('Encounters')).toHaveLength(2);

		await demonRecordsClient.landBatch(1);
		await flushed;
		await encounterRowBatchWriter.flushRemaining();
		await Promise.all(processed);

		expect(
			domainTablesClient
				.tablesInCallOrder()
				.filter((table) => table === 'Encounters')
		).toHaveLength(2);
	});

	it('fills a staging batch larger than the domain limiter’s concurrency cap, because the limiter wraps only a chunk flush', async () => {
		const { demonRecordsClient, writer: stagingWriter } = makeStagingWriter(3);
		// A limiter that admits one flush at a time and never releases it, standing
		// in for a concurrency cap smaller than the staging batch. If it wrapped the
		// whole row rather than just the chunk flush, rows 2 and 3 could never reach
		// the staging buffer and the batch could never fill.
		const { limitChunkFlush, flushesAdmitted } = neverRunningChunkLimiter();
		const { writer: encounterRowBatchWriter } = makeEncounterRowWriter({
			chunkSize: 3,
			limitChunkFlush
		});

		for (const row of makeDemonRows(3)) {
			trackSettlement(
				processEncounterRow(row, stagingWriter, encounterRowBatchWriter)
			);
		}
		await settlePendingMicrotasks();

		expect(demonRecordsClient.upsert).toHaveBeenCalledTimes(1);
		expect(demonRecordsClient.rowsOfBatch()).toHaveLength(3);

		await demonRecordsClient.landBatch();

		// All three rows reached the domain writer and filled one chunk.
		expect(flushesAdmitted).toHaveLength(1);
	});
});

describe('EncounterRowBatchWriter', () => {
	describe('buffering rows until the chunk size is reached', () => {
		it('flushes a chunk as one bulk upsert per entity type once writeEncounterRow has been called chunkSize times', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 3
			});

			const written = makeDemonRows(3).map((row) =>
				writer.writeEncounterRow(row)
			);
			await Promise.all(written);

			expect(domainTablesClient.tablesInCallOrder()).toEqual([
				'Species',
				'Birds',
				'Locations',
				'Sessions',
				'Encounters'
			]);
			expect(domainTablesClient.rowsUpsertedInto('Encounters')).toHaveLength(3);
		});

		it('leaves a chunk that has not reached chunkSize unwritten, with its rows still pending', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 3
			});

			const settlements = makeDemonRows(2).map((row) =>
				trackSettlement(writer.writeEncounterRow(row))
			);
			await settlePendingMicrotasks();

			expect(domainTablesClient.upsertCalls).toHaveLength(0);
			expect(settlements.map(({ resolved }) => resolved)).toEqual([
				false,
				false
			]);
		});

		it('rejects a casualty row with no ring number straight away, without buffering it', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 1
			});

			// A casualty record has no representable Bird, so it would fail the whole
			// chunk's Birds upsert on a NOT NULL column — it is filtered out before it
			// can reach one, same as `buildDemonRecord` skips it before staging.
			await expect(
				writer.writeEncounterRow(makeDemonRow({ ring_no: '' }))
			).rejects.toBeInstanceOf(CasualtyEncounterError);
			expect(domainTablesClient.upsertCalls).toHaveLength(0);
		});

		it("rejects a '-' -ring casualty row straight away, without buffering it", async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 1
			});

			await expect(
				writer.writeEncounterRow(makeDemonRow({ ring_no: '-' }))
			).rejects.toBeInstanceOf(CasualtyEncounterError);
			await expect(
				writer.writeEncounterRow(makeDemonRow({ ring_no: ' - ' }))
			).rejects.toBeInstanceOf(CasualtyEncounterError);
			expect(domainTablesClient.upsertCalls).toHaveLength(0);
		});

		it('applies ON CONFLICT DO UPDATE against each entity type’s own unique constraint', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 1
			});

			await writer.writeEncounterRow(makeDemonRow());

			expect(
				domainTablesClient.upsertCalls.map(({ table, options }) => [
					table,
					options
				])
			).toEqual([
				['Species', { onConflict: 'species_name', ignoreDuplicates: false }],
				['Birds', { onConflict: 'ring_no', ignoreDuplicates: false }],
				[
					'Locations',
					{
						onConflict: 'location_name,ringing_group_id',
						ignoreDuplicates: false
					}
				],
				[
					'Sessions',
					{
						onConflict: 'visit_date,ringing_group_id',
						ignoreDuplicates: false
					}
				],
				[
					'Encounters',
					{
						onConflict: 'bird_id,location_id,visit_date',
						ignoreDuplicates: false
					}
				]
			]);
		});
	});

	describe('deduplicating repeated entity values within a chunk', () => {
		it('dedupes two rows sharing a species_name down to one Species entry', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 2
			});

			await Promise.all([
				writer.writeEncounterRow(
					makeDemonRow({ ring_no: 'A000001', species_name: 'Robin' })
				),
				writer.writeEncounterRow(
					makeDemonRow({ ring_no: 'A000002', species_name: 'Robin' })
				)
			]);

			// Postgres rejects a multi-row ON CONFLICT DO UPDATE that targets the same
			// conflict key twice, so this is correctness rather than efficiency.
			expect(domainTablesClient.rowsUpsertedInto('Species')).toEqual([
				{ species_name: 'Robin' }
			]);
		});

		it('dedupes each entity type independently, so rows sharing a species still write their own Birds', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 2
			});

			await Promise.all([
				writer.writeEncounterRow(
					makeDemonRow({ ring_no: 'A000001', species_name: 'Robin' })
				),
				writer.writeEncounterRow(
					makeDemonRow({ ring_no: 'A000002', species_name: 'Robin' })
				)
			]);

			expect(domainTablesClient.rowsUpsertedInto('Species')).toHaveLength(1);
			expect(
				domainTablesClient
					.rowsUpsertedInto('Birds')
					.map(({ ring_no }) => ring_no)
			).toEqual(['A000001', 'A000002']);
		});

		it('upserts exactly one entry per entity type when every row in the chunk shares all four lookup values', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 3
			});

			const identicalRow = makeDemonRow();
			await Promise.all(
				[1, 2, 3].map(() => writer.writeEncounterRow({ ...identicalRow }))
			);

			for (const table of [
				'Species',
				'Birds',
				'Locations',
				'Sessions',
				'Encounters'
			]) {
				expect(domainTablesClient.rowsUpsertedInto(table)).toHaveLength(1);
			}
		});
	});

	describe('writing entity types in FK dependency order', () => {
		it('writes Species, Birds, Locations, Sessions then Encounters, each payload carrying the ids the earlier upserts resolved', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 1
			});

			await writer.writeEncounterRow(
				makeDemonRow({
					ring_no: 'A123456',
					species_name: 'Robin',
					loc_id: 'Garden Trap',
					visit_date: '15/03/2024'
				})
			);

			expect(domainTablesClient.tablesInCallOrder()).toEqual([
				'Species',
				'Birds',
				'Locations',
				'Sessions',
				'Encounters'
			]);
			expect(domainTablesClient.rowsUpsertedInto('Birds')).toEqual([
				{
					ring_no: 'A123456',
					species_id: domainTablesClient.idFor('Species', 'Robin')
				}
			]);
			expect(
				domainTablesClient.rowsUpsertedInto('Encounters')[0]
			).toMatchObject({
				bird_id: domainTablesClient.idFor('Birds', 'A123456'),
				location_id: domainTablesClient.idFor(
					'Locations',
					'Garden Trap',
					DOMAIN_RINGING_GROUP_ID
				),
				session_id: domainTablesClient.idFor(
					'Sessions',
					'2024-03-15',
					DOMAIN_RINGING_GROUP_ID
				)
			});
		});
	});

	describe('resolving bulk-upsert results back to each row by natural key', () => {
		it('selects each entity type’s natural-key columns alongside its id, so a returned row can be matched to what was sent', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 1
			});

			await writer.writeEncounterRow(makeDemonRow());

			expect(
				domainTablesClient.upsertCalls.map(({ table, selectedColumns }) => [
					table,
					selectedColumns
				])
			).toEqual([
				['Species', ['id', 'species_name']],
				['Birds', ['id', 'ring_no']],
				['Locations', ['id', 'location_name', 'ringing_group_id']],
				['Sessions', ['id', 'visit_date', 'ringing_group_id']],
				['Encounters', ['id', 'bird_id', 'location_id', 'visit_date']]
			]);
		});

		it('maps the right id onto each row even when the response rows come back in a different order than the request', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 2
			});
			domainTablesClient.reverseResponses();

			await Promise.all([
				writer.writeEncounterRow(
					makeDemonRow({ ring_no: 'A000001', species_name: 'Robin' })
				),
				writer.writeEncounterRow(
					makeDemonRow({ ring_no: 'A000002', species_name: 'Wren' })
				)
			]);

			expect(domainTablesClient.rowsUpsertedInto('Birds')).toEqual([
				{
					ring_no: 'A000001',
					species_id: domainTablesClient.idFor('Species', 'Robin')
				},
				{
					ring_no: 'A000002',
					species_id: domainTablesClient.idFor('Species', 'Wren')
				}
			]);
		});
	});

	describe('looking up and linking a new ring’s RingSequence per row', () => {
		it('looks up the matching RingSequences row by full ring number and links the bird to it for this group', async () => {
			const RESOLVED_RING_SEQUENCE_ID = 555;
			const {
				domainTablesClient,
				writer,
				lookupRingSequence,
				linkRingSequence
			} = makeEncounterRowWriter({
				chunkSize: 1,
				ringSequenceId: RESOLVED_RING_SEQUENCE_ID
			});

			await writer.writeEncounterRow(
				makeDemonRow({ ring_no: 'AEL1699', record_type: 'N' })
			);

			expect(lookupRingSequence).toHaveBeenCalledTimes(1);
			expect(lookupRingSequence).toHaveBeenCalledWith(
				'AEL1699',
				DOMAIN_RINGING_GROUP_ID
			);
			expect(linkRingSequence).toHaveBeenCalledWith(
				domainTablesClient.idFor('Birds', 'AEL1699'),
				RESOLVED_RING_SEQUENCE_ID,
				DOMAIN_RINGING_GROUP_ID
			);
		});

		it.each(['S', 'C', 'U', 'F', 'D'])(
			'does not look up a RingSequences row or link anything for a non-N record_type (%s)',
			async (recordType) => {
				const { writer, lookupRingSequence, linkRingSequence } =
					makeEncounterRowWriter({ chunkSize: 1, ringSequenceId: 555 });

				await writer.writeEncounterRow(
					makeDemonRow({ ring_no: 'AEL1699', record_type: recordType })
				);

				expect(lookupRingSequence).not.toHaveBeenCalled();
				expect(linkRingSequence).not.toHaveBeenCalled();
			}
		);

		it('does not link anything when no sequence matches (lookup returns null)', async () => {
			const { writer, lookupRingSequence, linkRingSequence } =
				makeEncounterRowWriter({ chunkSize: 1, ringSequenceId: null });

			await writer.writeEncounterRow(
				makeDemonRow({ ring_no: 'AEL1699', record_type: 'N' })
			);

			expect(lookupRingSequence).toHaveBeenCalledWith(
				'AEL1699',
				DOMAIN_RINGING_GROUP_ID
			);
			expect(linkRingSequence).not.toHaveBeenCalled();
		});

		it('looks a sequence up once per N row in the chunk, not once per chunk', async () => {
			const { writer, lookupRingSequence } = makeEncounterRowWriter({
				chunkSize: 2,
				ringSequenceId: null
			});

			await Promise.all(
				makeDemonRows(2, { record_type: 'N' }).map((row) =>
					writer.writeEncounterRow(row)
				)
			);

			expect(lookupRingSequence.mock.calls).toEqual([
				['A000000', DOMAIN_RINGING_GROUP_ID],
				['A000001', DOMAIN_RINGING_GROUP_ID]
			]);
		});
	});

	describe('building each entity type’s insert payload', () => {
		/** Imports one row in a chunk of its own, and hands back what was written. */
		async function writeOneRow(overrides: Partial<DemonRow> = {}) {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 1
			});
			const result = await writer.writeEncounterRow(makeDemonRow(overrides));
			return { domainTablesClient, result };
		}

		it('upserts Species on the species name alone', async () => {
			const { domainTablesClient } = await writeOneRow({
				species_name: 'Blue Tit'
			});
			expect(domainTablesClient.rowsUpsertedInto('Species')).toEqual([
				{ species_name: 'Blue Tit' }
			]);
		});

		it('upserts Locations on the row’s loc_id and the importing group', async () => {
			const { domainTablesClient } = await writeOneRow({
				loc_id: 'Garden Trap'
			});
			expect(domainTablesClient.rowsUpsertedInto('Locations')).toEqual([
				{
					location_name: 'Garden Trap',
					ringing_group_id: DOMAIN_RINGING_GROUP_ID
				}
			]);
		});

		// The old (visit_date, location_id, session_type) key and the record_type/age
		// bucketing that computed session_type are both gone (#1024) — a Session is
		// one row per group-day now.
		it('upserts Sessions on the converted visit_date and the importing group, with no location_id or session_type', async () => {
			const { domainTablesClient } = await writeOneRow({
				visit_date: '15/03/2023',
				record_type: 'U',
				age: '1'
			});
			expect(domainTablesClient.rowsUpsertedInto('Sessions')).toEqual([
				{
					visit_date: '2023-03-15',
					ringing_group_id: DOMAIN_RINGING_GROUP_ID
				}
			]);
		});

		it('upserts Encounters with the row’s own measurements alongside the resolved ids', async () => {
			const { domainTablesClient } = await writeOneRow({
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

			expect(
				domainTablesClient.rowsUpsertedInto('Encounters')[0]
			).toMatchObject({
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
				capture_method: 'M',
				visit_date: '2024-06-01'
			});
		});

		it('converts empty-string fields to null on the Encounters payload', async () => {
			const { domainTablesClient } = await writeOneRow({
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

			expect(
				domainTablesClient.rowsUpsertedInto('Encounters')[0]
			).toMatchObject({
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
			});
		});

		it.each([
			['3J', 3, true],
			['6', 6, false]
		])(
			'parses age "%s" into age_code %i with is_juv %s',
			async (age, ageCode, isJuv) => {
				const { domainTablesClient } = await writeOneRow({ age: String(age) });
				expect(
					domainTablesClient.rowsUpsertedInto('Encounters')[0]
				).toMatchObject({ age_code: ageCode, is_juv: isJuv });
			}
		);

		it('resolves each row with its converted visit date', async () => {
			const { result } = await writeOneRow({ visit_date: '22/11/2022' });
			expect(result).toEqual({ visitDate: '2022-11-22' });
		});
	});

	describe('handing each chunk flush to the caller’s concurrency limiter', () => {
		it('wraps a whole chunk flush rather than a row, so the limiter caps concurrent chunks', async () => {
			const { limitChunkFlush, flushesAdmitted } = neverRunningChunkLimiter();
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 1,
				limitChunkFlush
			});

			for (const row of makeDemonRows(2)) {
				trackSettlement(writer.writeEncounterRow(row));
			}
			await settlePendingMicrotasks();

			// Both chunks were offered to the limiter, and neither wrote anything
			// while it withheld them.
			expect(flushesAdmitted).toHaveLength(2);
			expect(domainTablesClient.upsertCalls).toHaveLength(0);
		});
	});

	describe('chunk-level failure handling', () => {
		const CHUNK_FAILURE = { message: 'upsert into Locations denied' };

		it('rejects every row buffered in the chunk when one entity type’s bulk upsert fails', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 2
			});
			vi.spyOn(console, 'error').mockImplementation(() => {});
			domainTablesClient.failOn('Locations', CHUNK_FAILURE);

			const settlements = makeDemonRows(2).map((row) =>
				trackSettlement(writer.writeEncounterRow(row))
			);
			await writer.flushRemaining();

			expect(settlements.map(({ rejectedWith }) => rejectedWith)).toEqual([
				CHUNK_FAILURE,
				CHUNK_FAILURE
			]);
			// Nothing downstream of the failed entity type was attempted.
			expect(domainTablesClient.tablesInCallOrder()).toEqual([
				'Species',
				'Birds',
				'Locations'
			]);
		});

		it('logs a chunk failure with the job, group, row count and row positions', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 2
			});
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			domainTablesClient.failOn('Locations', CHUNK_FAILURE);

			const settlements = makeDemonRows(2).map((row) =>
				trackSettlement(writer.writeEncounterRow(row))
			);
			await writer.flushRemaining();

			expect(errorSpy).toHaveBeenCalledWith(
				expect.stringContaining('domain-table chunk'),
				{
					importJobId: DOMAIN_IMPORT_JOB_ID,
					ringingGroupId: DOMAIN_RINGING_GROUP_ID,
					rowCount: 2,
					rowIndices: [0, 1]
				},
				CHUNK_FAILURE
			);
			// Asserted so the rejections above are observed, not unhandled.
			expect(settlements.map(({ rejectedWith }) => rejectedWith)).not.toContain(
				undefined
			);
		});

		it('fails the chunk without writing anything when the caller’s limiter rejects first (the route’s 280s deadline)', async () => {
			const deadlineExceeded = new Error('Import deadline exceeded');
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 2,
				limitChunkFlush: () => Promise.reject(deadlineExceeded)
			});
			vi.spyOn(console, 'error').mockImplementation(() => {});

			const settlements = makeDemonRows(2).map((row) =>
				trackSettlement(writer.writeEncounterRow(row))
			);
			await writer.flushRemaining();

			expect(settlements.map(({ rejectedWith }) => rejectedWith)).toEqual([
				deadlineExceeded,
				deadlineExceeded
			]);
			expect(domainTablesClient.upsertCalls).toHaveLength(0);
		});
	});

	describe('flushing the trailing partial chunk', () => {
		it('writes the trailing chunk and resolves only once every chunk write has finished', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 2
			});

			const settlements = makeDemonRows(3).map((row) =>
				trackSettlement(writer.writeEncounterRow(row))
			);
			await settlePendingMicrotasks();

			// The first two filled a chunk; the third is still sitting in the buffer.
			expect(domainTablesClient.upsertCalls).toHaveLength(5);
			expect(settlements.map(({ resolved }) => resolved)).toEqual([
				true,
				true,
				false
			]);

			await writer.flushRemaining();

			expect(domainTablesClient.upsertCalls).toHaveLength(10);
			expect(settlements.map(({ resolved }) => resolved)).toEqual([
				true,
				true,
				true
			]);
		});

		it('is a no-op once every row has already been written in a full chunk', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 2
			});

			await Promise.all(
				makeDemonRows(2).map((row) => writer.writeEncounterRow(row))
			);
			await writer.flushRemaining();

			expect(domainTablesClient.upsertCalls).toHaveLength(5);
		});
	});

	describe('reporting the distinct species ids a run has written', () => {
		it('is empty before any chunk has landed', () => {
			const { writer } = makeEncounterRowWriter({ chunkSize: 2 });

			expect(writer.getDistinctSpeciesIds()).toEqual([]);
		});

		it('returns the distinct Species.id values across every chunk that has landed so far', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 1
			});

			await writer.writeEncounterRow(
				makeDemonRow({ ring_no: 'A000001', species_name: 'Blue Tit' })
			);
			await writer.writeEncounterRow(
				makeDemonRow({ ring_no: 'A000002', species_name: 'Robin' })
			);

			expect(writer.getDistinctSpeciesIds()).toEqual(
				[
					domainTablesClient.idFor('Species', 'Blue Tit'),
					domainTablesClient.idFor('Species', 'Robin')
				].sort((a, b) => a - b)
			);
		});

		it('dedupes two rows of the same species, landed in different chunks, down to one id', async () => {
			const { writer } = makeEncounterRowWriter({ chunkSize: 1 });

			await writer.writeEncounterRow(
				makeDemonRow({ ring_no: 'A000001', species_name: 'Blue Tit' })
			);
			await writer.writeEncounterRow(
				makeDemonRow({ ring_no: 'A000002', species_name: 'Blue Tit' })
			);

			expect(writer.getDistinctSpeciesIds()).toHaveLength(1);
		});

		it('excludes a species whose only row was a ringless casualty, which never reaches a chunk', async () => {
			const { writer } = makeEncounterRowWriter({ chunkSize: 1 });

			await expect(
				writer.writeEncounterRow(
					makeDemonRow({ ring_no: '', species_name: 'Casualty Species' })
				)
			).rejects.toBeInstanceOf(CasualtyEncounterError);

			expect(writer.getDistinctSpeciesIds()).toEqual([]);
		});
	});

	describe('reconciling same-run duplicate Encounters on flush', () => {
		/**
		 * The two halves of a duplicate pair: one bird, one site, one day, logged
		 * twice. Each carries a measurement the other left blank, so a
		 * last-write-wins upsert would discard whichever landed first.
		 */
		const earlierDuplicate = makeDemonRow({
			capture_time: '08:30',
			record_type: 'N',
			weight: '10.5',
			wing_length: ''
		});
		const laterDuplicate = makeDemonRow({
			capture_time: '15:45',
			record_type: 'R',
			weight: '',
			wing_length: '65'
		});

		/** Every upsert into Encounters, in call order — the last is the wrap-up. */
		const encounterUpserts = (
			domainTablesClient: ReturnType<typeof makeDomainTablesClient>
		) =>
			domainTablesClient.upsertCalls.filter(
				({ table }) => table === 'Encounters'
			);

		it('issues no extra Encounters upsert for a run in which no two rows share a natural key', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 1
			});

			await writer.writeEncounterRow(makeDemonRow({ ring_no: 'A000001' }));
			await writer.writeEncounterRow(makeDemonRow({ ring_no: 'A000002' }));
			await writer.flushRemaining();

			expect(encounterUpserts(domainTablesClient)).toHaveLength(2);
		});

		it('rewrites a key two chunks both wrote to with the merge of both rows', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 1
			});

			await writer.writeEncounterRow(earlierDuplicate);
			await writer.writeEncounterRow(laterDuplicate);
			await writer.flushRemaining();

			const reconciliation = encounterUpserts(domainTablesClient).at(-1);
			expect(encounterUpserts(domainTablesClient)).toHaveLength(3);
			expect(reconciliation?.rows).toEqual([
				expect.objectContaining({
					// From the chronologically first row, which recorded them.
					capture_time: '08:30',
					record_type: 'N',
					weight: 10.5,
					// Filled in from the later duplicate, which the first left blank.
					wing_length: 65
				})
			]);
		});

		it('reconciles a duplicate pair that landed in one chunk, whose own upsert keeps only the last row', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 2
			});

			await Promise.all([
				writer.writeEncounterRow(earlierDuplicate),
				writer.writeEncounterRow(laterDuplicate)
			]);
			await writer.flushRemaining();

			const [chunkUpsert, reconciliation] =
				encounterUpserts(domainTablesClient);
			// The chunk upsert saw one row, not two — `upsertChunkEntities` reduces
			// a chunk's same-key rows to the last occurrence's payload.
			expect(chunkUpsert.rows).toEqual([
				expect.objectContaining({ capture_time: '15:45', weight: null })
			]);
			expect(reconciliation.rows).toEqual([
				expect.objectContaining({ capture_time: '08:30', weight: 10.5 })
			]);
		});

		it('writes the same merged row whichever order the two duplicates arrive in', async () => {
			const mergedRowAfterArrivalOrder = async (
				rows: ReturnType<typeof makeDemonRow>[]
			) => {
				const { domainTablesClient, writer } = makeEncounterRowWriter({
					chunkSize: 1
				});
				for (const row of rows) await writer.writeEncounterRow(row);
				await writer.flushRemaining();
				return encounterUpserts(domainTablesClient).at(-1)?.rows;
			};

			expect(
				await mergedRowAfterArrivalOrder([laterDuplicate, earlierDuplicate])
			).toEqual(
				await mergedRowAfterArrivalOrder([earlierDuplicate, laterDuplicate])
			);
		});

		it('leaves out a duplicate whose chunk failed, so no row is written on a failed chunk’s behalf', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 1
			});
			domainTablesClient.failOn('Encounters', {
				message: 'insert into Encounters denied'
			});

			const settlements = [earlierDuplicate, laterDuplicate].map((row) =>
				trackSettlement(writer.writeEncounterRow(row))
			);
			await writer.flushRemaining();

			// The two failed chunk upserts, and no wrap-up write after them.
			expect(encounterUpserts(domainTablesClient)).toHaveLength(2);
			expect(settlements.map(({ rejectedWith }) => rejectedWith)).not.toContain(
				undefined
			);
		});

		it('logs and swallows a failing reconciliation upsert, since every row has already been written', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 1
			});
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const reconciliationFailure = { message: 'update on Encounters denied' };

			await writer.writeEncounterRow(earlierDuplicate);
			await writer.writeEncounterRow(laterDuplicate);
			domainTablesClient.failOn('Encounters', reconciliationFailure);
			await expect(writer.flushRemaining()).resolves.toBeUndefined();

			expect(errorSpy).toHaveBeenCalledWith(
				expect.stringContaining('reconcile duplicate Encounters'),
				{
					importJobId: DOMAIN_IMPORT_JOB_ID,
					ringingGroupId: DOMAIN_RINGING_GROUP_ID,
					duplicateKeyCount: 1
				},
				reconciliationFailure
			);
		});
	});
});

/**
 * The merge rule itself, unit tested: its branches (which row's `capture_time`
 * wins, null-filling, tie-breaking) are tedious to vary through a whole chunked
 * run, and the writer tests above cover when the rule is applied rather than
 * what it decides.
 */
describe('mergeDuplicateEncounters', () => {
	function makeEncounterInsert(overrides: Record<string, unknown> = {}) {
		return {
			bird_id: 201,
			location_id: 301,
			session_id: 401,
			visit_date: '2024-06-01',
			capture_time: '08:30',
			record_type: 'N',
			age_code: 5,
			is_juv: false,
			scheme: 'BTO',
			sex: 'M',
			sexing_method: 'P',
			breeding_condition: null,
			capture_method: null,
			extra_text: null,
			fat: null,
			finding_circumstances: null,
			finding_condition: null,
			moult_code: null,
			old_greater_coverts: null,
			pectoral_muscle: null,
			primary_moult: null,
			weight: null,
			wing_length: null,
			...overrides
		} as Parameters<typeof mergeDuplicateEncounters>[0];
	}

	const morningCapture = makeEncounterInsert({
		capture_time: '08:30',
		record_type: 'N',
		weight: 10.5
	});
	const afternoonCapture = makeEncounterInsert({
		capture_time: '15:45',
		record_type: 'R',
		weight: 11.2,
		wing_length: 65
	});

	it('keeps the earlier capture_time row’s capture_time and record_type', () => {
		expect(mergeDuplicateEncounters(morningCapture, afternoonCapture)).toEqual(
			expect.objectContaining({ capture_time: '08:30', record_type: 'N' })
		);
	});

	it('keeps the earlier row’s value for a column both rows recorded', () => {
		expect(
			mergeDuplicateEncounters(morningCapture, afternoonCapture).weight
		).toBe(10.5);
	});

	it('fills a column the earlier row left null from the later row', () => {
		expect(
			mergeDuplicateEncounters(morningCapture, afternoonCapture).wing_length
		).toBe(65);
	});

	it('is commutative, so the fold does not depend on which duplicate arrived first', () => {
		expect(mergeDuplicateEncounters(afternoonCapture, morningCapture)).toEqual(
			mergeDuplicateEncounters(morningCapture, afternoonCapture)
		);
	});

	it('breaks a capture_time tie towards the row that arrived earlier in the run', () => {
		const tiedCapture = makeEncounterInsert({
			capture_time: '08:30',
			record_type: 'R',
			weight: 11.2
		});

		expect(mergeDuplicateEncounters(morningCapture, tiedCapture)).toEqual(
			expect.objectContaining({ record_type: 'N', weight: 10.5 })
		);
	});
});

describe('dispatchStatsCacheRefreshEvents', () => {
	beforeEach(() => {
		vi.mocked(buildStatsCacheRefreshEvents).mockReset();
		vi.mocked(dispatchStatsCacheRefreshWindow).mockReset();
	});

	it('builds events from the given ids/dates/species and dispatches every one, in order', async () => {
		const events = [
			{
				importJobId: 42,
				rpcParams: { ringing_group_filter: 7 },
				affectedSpeciesIds: [3]
			},
			{
				importJobId: 42,
				rpcParams: {
					ringing_group_filter: 7,
					group_by_time_period: 'day' as const,
					from_date: '2024-06-01',
					to_date: '2024-06-01'
				},
				affectedSpeciesIds: [3]
			}
		];
		vi.mocked(buildStatsCacheRefreshEvents).mockReturnValue(events);
		vi.mocked(dispatchStatsCacheRefreshWindow).mockResolvedValue(undefined);

		await dispatchStatsCacheRefreshEvents(42, 7, ['2024-06-01'], [3]);

		expect(buildStatsCacheRefreshEvents).toHaveBeenCalledWith(
			42,
			7,
			['2024-06-01'],
			[3]
		);
		expect(dispatchStatsCacheRefreshWindow).toHaveBeenNthCalledWith(
			1,
			events[0]
		);
		expect(dispatchStatsCacheRefreshWindow).toHaveBeenNthCalledWith(
			2,
			events[1]
		);
	});

	it('logs and swallows a dispatch failure rather than throwing, merging logContext onto importJobId/ringingGroupId', async () => {
		vi.mocked(buildStatsCacheRefreshEvents).mockReturnValue([
			{
				importJobId: 42,
				rpcParams: { ringing_group_filter: 7 },
				affectedSpeciesIds: [3]
			}
		]);
		vi.mocked(dispatchStatsCacheRefreshWindow).mockRejectedValueOnce(
			new Error('queue unavailable')
		);
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(
			dispatchStatsCacheRefreshEvents(42, 7, ['2024-06-01'], [3], {
				csvFilePath: '/fake/alpha.csv'
			})
		).resolves.toBeUndefined();

		expect(errorSpy).toHaveBeenCalledWith(
			'Failed to dispatch stats-cache-refresh-window events',
			{ importJobId: 42, ringingGroupId: 7, csvFilePath: '/fake/alpha.csv' },
			expect.any(Error)
		);
	});

	it('defaults logContext to nothing extra when the caller passes none', async () => {
		vi.mocked(buildStatsCacheRefreshEvents).mockReturnValue([
			{
				importJobId: 42,
				rpcParams: { ringing_group_filter: 7 },
				affectedSpeciesIds: [3]
			}
		]);
		vi.mocked(dispatchStatsCacheRefreshWindow).mockRejectedValueOnce(
			new Error('queue unavailable')
		);
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		await dispatchStatsCacheRefreshEvents(42, 7, ['2024-06-01'], [3]);

		expect(errorSpy).toHaveBeenCalledWith(
			'Failed to dispatch stats-cache-refresh-window events',
			{ importJobId: 42, ringingGroupId: 7 },
			expect.any(Error)
		);
	});
});
