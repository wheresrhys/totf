import { describe, it, expect, vi } from 'vitest';
import type { DemonRow } from '../../types';
import { CasualtyEncounterError } from '../row-validation';
import { mergeDuplicateEncounters } from '../encounter-batch-writer';
import { makeDemonRow, makeDemonRows } from './helpers/demon-rows';
import {
	settlePendingMicrotasks,
	trackSettlement
} from './helpers/promise-settlement';
import {
	DOMAIN_IMPORT_JOB_ID,
	DOMAIN_RINGING_GROUP_ID,
	makeDomainTablesClient,
	makeEncounterRowWriter,
	neverRunningChunkLimiter
} from './helpers/encounter-row-writer';

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
				// Normalised to the form Postgres stores and hands back (#1219).
				capture_time: '09:15:00',
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
					capture_time: '08:30:00',
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
				expect.objectContaining({ capture_time: '15:45:00', weight: null })
			]);
			expect(reconciliation.rows).toEqual([
				expect.objectContaining({ capture_time: '08:30:00', weight: 10.5 })
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

	describe('reconciling against an Encounters row a previous run stored', () => {
		/**
		 * The ids `makeDomainTablesClient` mints for the first distinct bird and
		 * location it is asked about — the natural key every `makeDemonRow()`
		 * default lands on, and therefore the key a stored row has to carry to
		 * collide with one.
		 */
		const DEFAULT_ROW_KEY = {
			bird_id: 201,
			location_id: 301,
			visit_date: '2024-06-01'
		};

		/** A row already in Encounters, in the shape PostgREST reads one back. */
		const storedEncounterRow = (overrides: Record<string, unknown>) => ({
			...DEFAULT_ROW_KEY,
			session_id: 401,
			capture_time: '06:15:00',
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
		});

		const encounterUpserts = (
			domainTablesClient: ReturnType<typeof makeDomainTablesClient>
		) =>
			domainTablesClient.upsertCalls.filter(
				({ table }) => table === 'Encounters'
			);

		it('merges a stored row whose capture_time no row of this run carries', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 1,
				storedEncounters: [
					storedEncounterRow({ capture_time: '06:15:00', fat: 'B4' })
				]
			});

			await writer.writeEncounterRow(
				makeDemonRow({ capture_time: '15:45', weight: '10.5' })
			);
			await writer.flushRemaining();

			expect(encounterUpserts(domainTablesClient).at(-1)?.rows).toEqual([
				expect.objectContaining({
					// The earlier record is the one a previous import stored.
					capture_time: '06:15:00',
					fat: 'B4',
					// Still filled in from this run's row, which recorded it.
					weight: 10.5
				})
			]);
		});

		it('leaves a stored row this run re-imported alone, so a corrected value still overwrites it', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 1,
				storedEncounters: [
					storedEncounterRow({ capture_time: '08:30:00', weight: 99 })
				]
			});

			// Same capture_time as the stored row: the same physical capture event,
			// imported again with a corrected weight rather than a second capture.
			await writer.writeEncounterRow(
				makeDemonRow({ capture_time: '08:30', weight: '10.5' })
			);
			await writer.flushRemaining();

			expect(encounterUpserts(domainTablesClient)).toHaveLength(1);
		});

		it('ignores a stored row the read’s superset filter pulled in for another key', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 1,
				storedEncounters: [
					storedEncounterRow({ bird_id: 202, capture_time: '06:15:00' })
				]
			});

			await writer.writeEncounterRow(makeDemonRow());
			await writer.flushRemaining();

			expect(encounterUpserts(domainTablesClient)).toHaveLength(1);
		});

		it('reads only the birds, locations and dates of the chunk it is about to write', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 2
			});

			await Promise.all([
				writer.writeEncounterRow(makeDemonRow({ ring_no: 'A000001' })),
				writer.writeEncounterRow(makeDemonRow({ ring_no: 'A000002' }))
			]);
			await writer.flushRemaining();

			expect(
				domainTablesClient.selectCalls.find(
					({ table }) => table === 'Encounters'
				)?.filters
			).toEqual([
				{
					operator: 'eq',
					column: 'ringing_group_id',
					value: DOMAIN_RINGING_GROUP_ID
				},
				{ operator: 'in', column: 'bird_id', value: [201, 202] },
				{ operator: 'in', column: 'location_id', value: [301] },
				{ operator: 'in', column: 'visit_date', value: ['2024-06-01'] }
			]);
		});

		it('logs and swallows a failing read, leaving the chunk’s own rows written', async () => {
			const { domainTablesClient, writer } = makeEncounterRowWriter({
				chunkSize: 1
			});
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const readFailure = { message: 'select on Encounters denied' };
			domainTablesClient.failSelectOn('Encounters', readFailure);

			await expect(
				writer.writeEncounterRow(makeDemonRow())
			).resolves.toBeDefined();

			expect(encounterUpserts(domainTablesClient)).toHaveLength(1);
			expect(errorSpy).toHaveBeenCalledWith(
				expect.stringContaining('read stored Encounters rows'),
				{
					importJobId: DOMAIN_IMPORT_JOB_ID,
					ringingGroupId: DOMAIN_RINGING_GROUP_ID,
					chunkRowCount: 1
				},
				readFailure
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
