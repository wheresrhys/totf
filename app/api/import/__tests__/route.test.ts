import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Transform } from 'node:stream';
import type { ImportMessage } from '../route';

// group-cookie is mocked globally to return group ID 1 (see vitest.setup.tsx)

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/lib/demon-import', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/demon-import')>();
	return {
		...actual,
		createUpserter: vi.fn(),
		processEncounterRow: vi.fn()
	};
});

const CSV_HEADER =
	'ring_no,species_name,visit_date,capture_time,loc_id,age,sex,sexing_method,record_type,scheme,breeding_condition,extra_text,moult_code,old_greater_coverts,weight,wing_length,entered_by,nest_link_code,validation_comments,submission_status,filename,new/subsequent,scheme2,ring_no2,pulli_ringed,pulli_alive,provisional_sex,gridref,habitat_1,habitat_2,status_code_1,status_code_2,lure_code_1,lure_code_2,date_measured,time_w,condition,alula,primary_moult,primary_covert_moult_scores,secondary_moult_scores,finding_condition,finding_circumstances,capture_method,metal_mark_info,ringer_initials,ringer_check_initials,processor_initials,extractor_initials,wing_initials,colour_mark_info,metal_mark_position,fat,pectoral_muscle,body_moult,greater_covert_moult_scores,alula_moult_scores,carpal_covert_moult,wing_point,primary_length,bill_length_method,bill_length,head_bill_length,bill_depth_method,bill_depth,tarsus_length_method,tail_moult_scores,tarsus_length,tail_length,claw_length,plumage,tail_diff,lesser_median_covert_moult,underwing_covert_moult,head_moult,upperparts_moult,underparts_moult,permit_no,pullus_stage,date_accuracy,left_leg_below,right_leg_below,left_leg_above,right_leg_above,neck_collar,left_wing_tag,right_wing_tag,nasal_saddle,sample_processed,high_tide_time,finder_name,own,own2,userc1,userc2,email,userc3,userc4,userc5,userv1,userv2,userv3,userv4,userv5,l_primary_moult_scores,l_secondary_moult_scores,l_tail_moult_scores,l_primary_covert_moult_scores,l_greater_covert_moult_scores,l_carpal_covert_moult,l_alula_moult_scores,toe_span';

function makeCsvRow(overrides: Record<string, string> = {}): string {
	const defaults: Record<string, string> = {
		ring_no: 'A123456',
		species_name: 'Blue Tit',
		visit_date: '01/06/2024',
		capture_time: '08:30',
		loc_id: 'Garden Trap',
		age: '5',
		sex: 'M',
		sexing_method: 'P',
		record_type: 'N',
		scheme: 'BTO'
	};
	const values = { ...defaults, ...overrides };
	const headers = CSV_HEADER.split(',');
	return headers.map((h) => values[h] ?? '').join(',');
}

function makeCsvFile(rows: string[]): File {
	const content = [CSV_HEADER, ...rows].join('\n');
	return new File([content], 'test.csv', { type: 'text/csv' });
}

async function makeRequest(file: File): Promise<Request> {
	const formData = new FormData();
	formData.append('csv', file);
	return new Request('http://localhost/api/import', {
		method: 'POST',
		body: formData
	});
}

async function readStreamMessages(
	response: Response
): Promise<ImportMessage[]> {
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	const messages: ImportMessage[] = [];
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop()!;
		for (const line of lines) {
			if (line.trim()) messages.push(JSON.parse(line));
		}
	}
	return messages;
}

describe('POST /api/import', () => {
	let POST: (request: Request) => Promise<Response>;
	let mockUpsert: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		vi.resetModules();
		({ POST } = await import('../route'));

		const { getAuthenticatedSupabaseClient } = await import('@/lib/group-auth');
		const { createUpserter } = await import('@/lib/demon-import');
		mockUpsert = vi.fn().mockResolvedValue(1);
		vi.mocked(createUpserter).mockReturnValue(mockUpsert as never);
		vi.mocked(getAuthenticatedSupabaseClient).mockResolvedValue({} as never);
	});

	describe('authentication', () => {
		it('returns 401 when not authenticated', async () => {
			const { getGroupCookie } = await import('@/app/actions/group-cookie');
			vi.mocked(getGroupCookie).mockResolvedValueOnce(null);

			const request = await makeRequest(makeCsvFile([makeCsvRow()]));
			const response = await POST(request);
			expect(response.status).toBe(401);
		});
	});

	describe('request validation', () => {
		it('returns 400 when no csv file is provided', async () => {
			const formData = new FormData();
			const request = new Request('http://localhost/api/import', {
				method: 'POST',
				body: formData
			});
			const response = await POST(request);
			expect(response.status).toBe(400);
		});
	});

	describe('successful import', () => {
		beforeEach(async () => {
			const { processEncounterRow } = await import('@/lib/demon-import');
			vi.mocked(processEncounterRow).mockResolvedValue({
				visitDate: '2024-06-01'
			});
		});

		it('calls processEncounterRow for each CSV row', async () => {
			const { processEncounterRow } = await import('@/lib/demon-import');
			const file = makeCsvFile([
				makeCsvRow(),
				makeCsvRow({ ring_no: 'B654321' })
			]);
			const response = await POST(await makeRequest(file));
			await readStreamMessages(response);
			expect(vi.mocked(processEncounterRow)).toHaveBeenCalledTimes(2);
		});

		it('streams a complete message with correct counts', async () => {
			const file = makeCsvFile([
				makeCsvRow(),
				makeCsvRow({ ring_no: 'B654321' })
			]);
			const response = await POST(await makeRequest(file));
			const messages = await readStreamMessages(response);
			const complete = messages.find((m) => m.type === 'complete');
			expect(complete).toEqual({
				type: 'complete',
				processed: 2,
				successful: 2,
				failed: 0
			});
		});

		it('streams progress every 10 rows', async () => {
			const rows = Array.from({ length: 25 }, (_, i) =>
				makeCsvRow({ ring_no: `R${i.toString().padStart(6, '0')}` })
			);
			const response = await POST(await makeRequest(makeCsvFile(rows)));
			const messages = await readStreamMessages(response);
			const progressMessages = messages.filter((m) => m.type === 'progress');
			expect(progressMessages).toHaveLength(2);
			expect(progressMessages[0]).toEqual({ type: 'progress', processed: 10 });
			expect(progressMessages[1]).toEqual({ type: 'progress', processed: 20 });
		});

		it('sets response Content-Type to application/x-ndjson', async () => {
			const response = await POST(
				await makeRequest(makeCsvFile([makeCsvRow()]))
			);
			await readStreamMessages(response);
			expect(response.headers.get('Content-Type')).toBe('application/x-ndjson');
		});
	});

	describe('error handling', () => {
		it('counts rows where processEncounterRow throws as failed', async () => {
			const { processEncounterRow } = await import('@/lib/demon-import');
			vi.mocked(processEncounterRow)
				.mockResolvedValueOnce({ visitDate: '2024-06-01' })
				.mockRejectedValueOnce(new Error('DB error'))
				.mockResolvedValueOnce({ visitDate: '2024-06-02' });

			const file = makeCsvFile([
				makeCsvRow(),
				makeCsvRow({ ring_no: 'B000001' }),
				makeCsvRow({ ring_no: 'C000001' })
			]);
			const response = await POST(await makeRequest(file));
			const messages = await readStreamMessages(response);
			const complete = messages.find((m) => m.type === 'complete');
			expect(complete).toEqual({
				type: 'complete',
				processed: 3,
				successful: 2,
				failed: 1
			});
		});

		it('does not count CasualtyEncounterError rows as failed', async () => {
			const { processEncounterRow, CasualtyEncounterError } =
				await import('@/lib/demon-import');
			vi.mocked(processEncounterRow)
				.mockResolvedValueOnce({ visitDate: '2024-06-01' })
				.mockRejectedValueOnce(new CasualtyEncounterError());

			const file = makeCsvFile([makeCsvRow(), makeCsvRow({ ring_no: '' })]);
			const response = await POST(await makeRequest(file));
			const messages = await readStreamMessages(response);
			const complete = messages.find((m) => m.type === 'complete');
			expect(complete).toEqual({
				type: 'complete',
				processed: 2,
				successful: 1,
				failed: 0
			});
		});

		it('streams an error message when csv-parser emits an error', async () => {
			// Trigger the outer catch in the ReadableStream start function by making
			// csv-parser emit an error. Per-row errors are caught individually and
			// counted as failures; only errors from the parsing step itself reach
			// the outer catch and produce an error NDJSON message.
			vi.doMock('csv-parser', () => ({
				default: () => {
					return new Transform({
						objectMode: true,
						transform(
							_chunk: unknown,
							_enc: string,
							callback: (err?: Error) => void
						) {
							callback(new Error('CSV parse error'));
						}
					});
				}
			}));
			vi.resetModules();

			// Re-apply mocks cleared by resetModules
			vi.doMock('@/lib/group-auth', () => ({
				getAuthenticatedSupabaseClient: vi.fn().mockResolvedValue({})
			}));
			vi.doMock('@/lib/demon-import', async (importOriginal) => {
				const actual =
					await importOriginal<typeof import('@/lib/demon-import')>();
				return {
					...actual,
					createUpserter: vi.fn().mockReturnValue(vi.fn()),
					processEncounterRow: vi.fn()
				};
			});

			const { POST: freshPOST } = await import('../route');
			const file = makeCsvFile([makeCsvRow()]);
			const response = await freshPOST(await makeRequest(file));
			const messages = await readStreamMessages(response);
			expect(messages.some((m) => m.type === 'error')).toBe(true);
		});
	});
});
