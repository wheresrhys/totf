import { Readable } from 'stream';
import csvParser from 'csv-parser';
import { getGroupCookie } from '@/app/actions/group-cookie';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import {
	createUpserter,
	processEncounterRow,
	CasualtyEncounterError,
	type DemonRow
} from '@/lib/demon-import';

export const maxDuration = 300;

export type ImportProgressMessage = { type: 'progress'; processed: number };
export type ImportCompleteMessage = {
	type: 'complete';
	processed: number;
	successful: number;
	failed: number;
};
export type ImportTimeoutMessage = {
	type: 'timeout';
	processed: number;
	startDate: string | null;
	endDate: string | null;
};
export type ImportErrorMessage = { type: 'error'; message: string };
export type ImportMessage =
	| ImportProgressMessage
	| ImportCompleteMessage
	| ImportTimeoutMessage
	| ImportErrorMessage;

const TIMEOUT_MS = 280_000;

export async function POST(request: Request): Promise<Response> {
	const ringingGroupId = await getGroupCookie();
	if (!ringingGroupId) {
		return new Response('Unauthorized', { status: 401 });
	}

	const formData = await request.formData();
	const file = formData.get('csv') as File | null;
	if (!file) {
		return new Response('Missing csv file', { status: 400 });
	}

	const buffer = Buffer.from(await file.arrayBuffer());
	const supabaseClient = await getAuthenticatedSupabaseClient();
	const upsert = createUpserter(supabaseClient);
	const deadline = Date.now() + TIMEOUT_MS;
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			function send(message: ImportMessage): void {
				controller.enqueue(encoder.encode(JSON.stringify(message) + '\n'));
			}

			let processed = 0;
			let successful = 0;
			let failed = 0;
			let startDate: string | null = null;
			let endDate: string | null = null;

			try {
				const rows: DemonRow[] = [];
				await new Promise<void>((resolve, reject) => {
					Readable.from(buffer)
						.pipe(csvParser())
						.on('data', (row: DemonRow) => rows.push(row))
						.on('end', resolve)
						.on('error', reject);
				});

				for (const row of rows) {
					if (Date.now() > deadline) {
						send({ type: 'timeout', processed, startDate, endDate });
						return;
					}

					try {
						const { visitDate } = await processEncounterRow(
							row,
							upsert,
							ringingGroupId
						);
						successful++;
						if (startDate === null || visitDate < startDate)
							startDate = visitDate;
						if (endDate === null || visitDate > endDate) endDate = visitDate;
					} catch (err) {
						if (!(err instanceof CasualtyEncounterError)) {
							failed++;
						}
					}

					processed++;
					if (processed % 10 === 0) {
						send({ type: 'progress', processed });
					}
				}

				send({ type: 'complete', processed, successful, failed });
			} catch (err) {
				send({
					type: 'error',
					message: err instanceof Error ? err.message : String(err)
				});
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: { 'Content-Type': 'application/x-ndjson' }
	});
}
