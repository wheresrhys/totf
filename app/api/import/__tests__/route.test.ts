import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DemonImportUpdate } from '@/modules/demon-import';

// group-cookie is mocked globally to return group ID 1 (see vitest.setup.tsx)

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/modules/demon-import', () => ({
	runDemonImport: vi.fn()
}));

async function makeRequest(file: File | null): Promise<Request> {
	const formData = new FormData();
	if (file) formData.append('csv', file);
	return new Request('http://localhost/api/import', {
		method: 'POST',
		body: formData
	});
}

async function readStreamMessages(
	response: Response
): Promise<DemonImportUpdate[]> {
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	const messages: DemonImportUpdate[] = [];
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

async function* canned(
	updates: DemonImportUpdate[]
): AsyncGenerator<DemonImportUpdate> {
	for (const update of updates) yield update;
}

describe('POST /api/import', () => {
	let POST: (request: Request) => Promise<Response>;

	beforeEach(async () => {
		vi.resetModules();
		({ POST } = await import('../route'));

		const { getAuthenticatedSupabaseClient } =
			await import('@/app/lib/auth/group-auth');
		vi.mocked(getAuthenticatedSupabaseClient).mockResolvedValue({} as never);

		const { runDemonImport } = await import('@/modules/demon-import');
		vi.mocked(runDemonImport).mockReturnValue(
			canned([
				{ type: 'progress', processed: 10 },
				{
					type: 'complete',
					processed: 10,
					successful: 10,
					failed: 0,
					skipped: 0
				}
			])
		);
	});

	it('returns 401 when not authenticated', async () => {
		const { getGroupCookie } = await import('@/app/actions/group-cookie');
		vi.mocked(getGroupCookie).mockResolvedValueOnce(null);

		const file = new File(['csv'], 'test.csv', { type: 'text/csv' });
		const response = await POST(await makeRequest(file));
		expect(response.status).toBe(401);
	});

	it('returns 400 when no csv file is provided', async () => {
		const response = await POST(await makeRequest(null));
		expect(response.status).toBe(400);
	});

	it('sets response Content-Type to application/x-ndjson', async () => {
		const file = new File(['csv'], 'test.csv', { type: 'text/csv' });
		const response = await POST(await makeRequest(file));
		await readStreamMessages(response);
		expect(response.headers.get('Content-Type')).toBe('application/x-ndjson');
	});

	it('streams each update runDemonImport yields as one NDJSON line, in order, then closes', async () => {
		const file = new File(['csv'], 'test.csv', { type: 'text/csv' });
		const response = await POST(await makeRequest(file));
		const messages = await readStreamMessages(response);

		expect(messages).toEqual([
			{ type: 'progress', processed: 10 },
			{ type: 'complete', processed: 10, successful: 10, failed: 0, skipped: 0 }
		]);
	});

	it('calls runDemonImport with the uploaded buffer, group id, supabase client and deadline', async () => {
		const { runDemonImport } = await import('@/modules/demon-import');
		const { getAuthenticatedSupabaseClient } =
			await import('@/app/lib/auth/group-auth');
		const supabaseClient = {};
		vi.mocked(getAuthenticatedSupabaseClient).mockResolvedValue(
			supabaseClient as never
		);

		const file = new File(['ring_no\nA123456'], 'test.csv', {
			type: 'text/csv'
		});
		await readStreamMessages(await POST(await makeRequest(file)));

		// Group ID 1 — group-cookie is mocked globally in vitest.setup.tsx.
		expect(vi.mocked(runDemonImport)).toHaveBeenCalledWith({
			supabaseClient,
			ringingGroupId: 1,
			source: Buffer.from('ring_no\nA123456'),
			timeoutMs: 280_000
		});
	});
});
