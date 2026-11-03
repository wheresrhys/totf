import { getGroupCookie } from '@/app/actions/group-cookie';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { runDemonImport } from '@/modules/demon-import';

export const maxDuration = 300;

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
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			for await (const update of runDemonImport({
				supabaseClient,
				ringingGroupId,
				source: buffer,
				timeoutMs: TIMEOUT_MS
			})) {
				controller.enqueue(encoder.encode(JSON.stringify(update) + '\n'));
			}
			controller.close();
		}
	});

	return new Response(stream, {
		headers: { 'Content-Type': 'application/x-ndjson' }
	});
}
