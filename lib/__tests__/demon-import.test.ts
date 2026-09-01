import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	transformEmptyStringsToNull,
	convertDateFormat,
	createUpserter,
	createRingSequenceLookup,
	CasualtyEncounterError,
	processEncounterRow,
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

describe('processEncounterRow', () => {
	const RINGING_GROUP_ID = 7;
	const RESOLVED_RING_SEQUENCE_ID = 555;
	let upsert: ReturnType<typeof vi.fn>;
	let lookupRingSequence: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		let callCount = 0;
		upsert = vi.fn().mockImplementation(() => {
			callCount++;
			return Promise.resolve(callCount * 10);
		});
		lookupRingSequence = vi.fn().mockResolvedValue(RESOLVED_RING_SEQUENCE_ID);
	});

	describe('casualty encounters', () => {
		it('throws CasualtyEncounterError when ring_no is empty', async () => {
			const row = makeDemonRow({ ring_no: '' });
			await expect(
				processEncounterRow(row, upsert, lookupRingSequence, RINGING_GROUP_ID)
			).rejects.toBeInstanceOf(CasualtyEncounterError);
		});

		it('does not call upsert when ring_no is empty', async () => {
			const row = makeDemonRow({ ring_no: '' });
			await expect(
				processEncounterRow(row, upsert, lookupRingSequence, RINGING_GROUP_ID)
			).rejects.toBeInstanceOf(CasualtyEncounterError);
			expect(upsert).not.toHaveBeenCalled();
		});

		it('processes normally when ring_no is present (already-ringed bird)', async () => {
			const row = makeDemonRow({ ring_no: 'A123456' });
			await expect(
				processEncounterRow(row, upsert, lookupRingSequence, RINGING_GROUP_ID)
			).resolves.toBeDefined();
			expect(upsert).toHaveBeenCalled();
		});
	});

	it('upserts Species with the species name', async () => {
		const row = makeDemonRow({ species_name: 'Blue Tit' });
		await processEncounterRow(
			row,
			upsert,
			lookupRingSequence,
			RINGING_GROUP_ID
		);
		expect(upsert).toHaveBeenCalledWith(
			'Species',
			{ species_name: 'Blue Tit' },
			['species_name']
		);
	});

	it('upserts Bird with ring_no, the species ID from Species upsert, and (for an N row) the resolved ring_sequence_id', async () => {
		const row = makeDemonRow({
			ring_no: 'A123456',
			species_name: 'Blue Tit',
			record_type: 'N'
		});
		await processEncounterRow(
			row,
			upsert,
			lookupRingSequence,
			RINGING_GROUP_ID
		);
		const speciesId = 10; // first call returns 10
		expect(upsert).toHaveBeenCalledWith(
			'Birds',
			{
				ring_no: 'A123456',
				species_id: speciesId,
				ring_sequence_id: RESOLVED_RING_SEQUENCE_ID
			},
			['ring_no']
		);
	});

	it('upserts Location with loc_id and ringing group ID', async () => {
		const row = makeDemonRow({ loc_id: 'Garden Trap' });
		await processEncounterRow(
			row,
			upsert,
			lookupRingSequence,
			RINGING_GROUP_ID
		);
		expect(upsert).toHaveBeenCalledWith(
			'Locations',
			{ location_name: 'Garden Trap', ringing_group_id: RINGING_GROUP_ID },
			['location_name', 'ringing_group_id']
		);
	});

	it('upserts Session with converted visit_date and location ID', async () => {
		const row = makeDemonRow({ visit_date: '15/03/2023' });
		await processEncounterRow(
			row,
			upsert,
			lookupRingSequence,
			RINGING_GROUP_ID
		);
		const locationId = 30; // third call returns 30
		expect(upsert).toHaveBeenCalledWith(
			'Sessions',
			{
				visit_date: '2023-03-15',
				location_id: locationId,
				session_type: 'FULL_GROWN'
			},
			['visit_date', 'location_id', 'session_type']
		);
	});

	describe('session_type bucketing', () => {
		function sessionData() {
			return upsert.mock.calls.find(([table]) => table === 'Sessions')?.[1];
		}

		it('buckets an N record_type with a non-pulli age as FULL_GROWN', async () => {
			await processEncounterRow(
				makeDemonRow({ record_type: 'N', age: '3' }),
				upsert,
				lookupRingSequence,
				RINGING_GROUP_ID
			);
			expect(sessionData()).toMatchObject({ session_type: 'FULL_GROWN' });
		});

		it('buckets an N record_type with age 1J (recently-fledged juvenile) as FULL_GROWN, not PULLI', async () => {
			await processEncounterRow(
				makeDemonRow({ record_type: 'N', age: '1J' }),
				upsert,
				lookupRingSequence,
				RINGING_GROUP_ID
			);
			expect(sessionData()).toMatchObject({ session_type: 'FULL_GROWN' });
		});

		it('buckets an N record_type with raw age 1 (nestling) as PULLI', async () => {
			await processEncounterRow(
				makeDemonRow({ record_type: 'N', age: '1' }),
				upsert,
				lookupRingSequence,
				RINGING_GROUP_ID
			);
			expect(sessionData()).toMatchObject({ session_type: 'PULLI' });
		});

		it.each(['U', 'F', 'D'])(
			'buckets a %s record_type as FIELD_OBSERVATION regardless of age (record-type precedence over age 1)',
			async (recordType) => {
				await processEncounterRow(
					makeDemonRow({ record_type: recordType, age: '1' }),
					upsert,
					lookupRingSequence,
					RINGING_GROUP_ID
				);
				expect(sessionData()).toMatchObject({
					session_type: 'FIELD_OBSERVATION'
				});
			}
		);

		it.each(['N', 'S', 'C', 'T'])(
			'buckets a %s record_type with a non-pulli age as FULL_GROWN',
			async (recordType) => {
				await processEncounterRow(
					makeDemonRow({ record_type: recordType, age: '3' }),
					upsert,
					lookupRingSequence,
					RINGING_GROUP_ID
				);
				expect(sessionData()).toMatchObject({ session_type: 'FULL_GROWN' });
			}
		);

		it('buckets an unrecognised record_type with a non-pulli age as FULL_GROWN', async () => {
			await processEncounterRow(
				makeDemonRow({ record_type: 'Z', age: '3' }),
				upsert,
				lookupRingSequence,
				RINGING_GROUP_ID
			);
			expect(sessionData()).toMatchObject({ session_type: 'FULL_GROWN' });
		});

		it('buckets an unrecognised record_type with raw age 1 as PULLI', async () => {
			await processEncounterRow(
				makeDemonRow({ record_type: 'Z', age: '1' }),
				upsert,
				lookupRingSequence,
				RINGING_GROUP_ID
			);
			expect(sessionData()).toMatchObject({ session_type: 'PULLI' });
		});

		it('buckets an empty/unparseable age as FULL_GROWN (NaN must not equal 1)', async () => {
			await processEncounterRow(
				makeDemonRow({ record_type: 'N', age: '' }),
				upsert,
				lookupRingSequence,
				RINGING_GROUP_ID
			);
			expect(sessionData()).toMatchObject({ session_type: 'FULL_GROWN' });
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
			finding_circumstances: '2'
		});
		await processEncounterRow(
			row,
			upsert,
			lookupRingSequence,
			RINGING_GROUP_ID
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
				finding_circumstances: '2'
			}),
			['bird_id', 'session_id']
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
			finding_circumstances: ''
		});
		await processEncounterRow(
			row,
			upsert,
			lookupRingSequence,
			RINGING_GROUP_ID
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
				finding_circumstances: null
			}),
			['bird_id', 'session_id']
		);
	});

	it('parses juvenile age codes (e.g. "3J") into age_code and is_juv', async () => {
		const row = makeDemonRow({ age: '3J' });
		await processEncounterRow(
			row,
			upsert,
			lookupRingSequence,
			RINGING_GROUP_ID
		);
		expect(upsert).toHaveBeenCalledWith(
			'Encounters',
			expect.objectContaining({ age_code: 3, is_juv: true }),
			['bird_id', 'session_id']
		);
	});

	it('parses non-juvenile age codes into age_code and is_juv: false', async () => {
		const row = makeDemonRow({ age: '6' });
		await processEncounterRow(
			row,
			upsert,
			lookupRingSequence,
			RINGING_GROUP_ID
		);
		expect(upsert).toHaveBeenCalledWith(
			'Encounters',
			expect.objectContaining({ age_code: 6, is_juv: false }),
			['bird_id', 'session_id']
		);
	});

	it('returns the converted visit date', async () => {
		const row = makeDemonRow({ visit_date: '22/11/2022' });
		const result = await processEncounterRow(
			row,
			upsert,
			lookupRingSequence,
			RINGING_GROUP_ID
		);
		expect(result.visitDate).toBe('2022-11-22');
	});

	it('calls upsert exactly 5 times (Species, Birds, Locations, Sessions, Encounters) — the lookup is a separate injected function, not routed through upsert', async () => {
		const row = makeDemonRow();
		await processEncounterRow(
			row,
			upsert,
			lookupRingSequence,
			RINGING_GROUP_ID
		);
		expect(upsert).toHaveBeenCalledTimes(5);
	});

	describe('RingSequences (record_type "N")', () => {
		function birdsData() {
			return upsert.mock.calls.find(([table]) => table === 'Birds')?.[1];
		}

		it('looks up the matching RingSequences row by full ring number and sets Birds.ring_sequence_id to its id', async () => {
			const row = makeDemonRow({ ring_no: 'AEL1699', record_type: 'N' });
			await processEncounterRow(
				row,
				upsert,
				lookupRingSequence,
				RINGING_GROUP_ID
			);
			expect(lookupRingSequence).toHaveBeenCalledWith(
				'AEL1699',
				RINGING_GROUP_ID
			);
			expect(birdsData()).toMatchObject({
				ring_sequence_id: RESOLVED_RING_SEQUENCE_ID
			});
		});

		it.each(['S', 'C', 'U', 'F', 'D'])(
			'does not look up a RingSequences row or set ring_sequence_id for a non-N record_type (%s)',
			async (recordType) => {
				const row = makeDemonRow({
					ring_no: 'AEL1699',
					record_type: recordType
				});
				await processEncounterRow(
					row,
					upsert,
					lookupRingSequence,
					RINGING_GROUP_ID
				);
				expect(lookupRingSequence).not.toHaveBeenCalled();
				expect(birdsData()).not.toHaveProperty('ring_sequence_id');
			}
		);

		it('leaves ring_sequence_id unset when no sequence matches (lookup returns null)', async () => {
			lookupRingSequence.mockResolvedValueOnce(null);
			const row = makeDemonRow({ ring_no: 'AEL1699', record_type: 'N' });
			await processEncounterRow(
				row,
				upsert,
				lookupRingSequence,
				RINGING_GROUP_ID
			);
			expect(lookupRingSequence).toHaveBeenCalledWith(
				'AEL1699',
				RINGING_GROUP_ID
			);
			expect(birdsData()).not.toHaveProperty('ring_sequence_id');
		});

		it('calls lookupRingSequence exactly once per N row', async () => {
			const row = makeDemonRow({ ring_no: 'AEL1699', record_type: 'N' });
			await processEncounterRow(
				row,
				upsert,
				lookupRingSequence,
				RINGING_GROUP_ID
			);
			expect(lookupRingSequence).toHaveBeenCalledTimes(1);
		});
	});
});
