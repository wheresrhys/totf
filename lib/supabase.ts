import {
	createClient,
	type PostgrestSingleResponse
} from '@supabase/supabase-js';

import type { Database } from '@/types/supabase.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * This app does not use Supabase Auth at all — there are no per-person logins,
 * and a group-scoped client carries a JWT this app signs itself
 * (`app/lib/auth/jwt.ts`) as a plain `Authorization` header. Nothing ever
 * calls `.auth.*`.
 *
 * So every client's bundled `GoTrueClient` is dead weight, and left at its
 * defaults it is dead weight that *keeps running*: `autoRefreshToken` defaults
 * to `true`, and on a non-browser platform `GoTrueClient._handleVisibilityChange`
 * unconditionally starts a 30-second `setInterval` session-refresh ticker that
 * nothing in this codebase ever stops. The interval closes over the client, so
 * every `createClient` call leaves a client object permanently reachable from
 * the timer — and `createSupabaseClientWithJwt` is called **per request** (and
 * per stats-cache-refresh queue invocation), with no cache in front of it since
 * #1216's predecessor removed the LRU one. In a long-lived server process that
 * accumulates without bound.
 *
 * Turning both off is what makes a per-request client genuinely disposable.
 * Verified in #1216 (see `supabase/CLAUDE.md`'s "Connection counts and client
 * lifecycle"): it is *not* the cause of high Postgres connection counts — a
 * supabase-js client holds no DB connection of its own — but it is the one real
 * per-client resource this code was leaking.
 */
const NO_SUPABASE_AUTH_SESSION = {
	auth: {
		autoRefreshToken: false,
		persistSession: false
	}
} as const;

export const supabase = createClient<Database>(
	supabaseUrl,
	supabaseAnonKey,
	NO_SUPABASE_AUTH_SESSION
);

export function createSupabaseClientWithJwt(jwt: string) {
	return createClient<Database>(supabaseUrl, supabaseAnonKey, {
		...NO_SUPABASE_AUTH_SESSION,
		global: {
			headers: { Authorization: `Bearer ${jwt}` }
		}
	});
}

export function catchSupabaseErrors<T>({
	data,
	error
}: PostgrestSingleResponse<T>): T | null {
	if (error) {
		throw new Error(`Failed to fetch data: ${error.message}`);
	}
	return data || null;
}

// PostgREST silently caps every response at this many rows (the Supabase
// db-max-rows default), so unbounded queries must page through results.
// Queries passed in must apply a deterministic order for paging to be stable.
const SUPABASE_MAX_ROWS_PER_REQUEST = 1000;

export async function fetchAllPaginatedRows<T>(
	buildPageQuery: (
		fromRow: number,
		toRow: number
	) => PromiseLike<PostgrestSingleResponse<T[]>>
): Promise<T[]> {
	const allRows: T[] = [];
	for (let page = 0; ; page++) {
		const fromRow = page * SUPABASE_MAX_ROWS_PER_REQUEST;
		const pageRows =
			catchSupabaseErrors(
				await buildPageQuery(
					fromRow,
					fromRow + SUPABASE_MAX_ROWS_PER_REQUEST - 1
				)
			) ?? [];
		allRows.push(...pageRows);
		if (pageRows.length < SUPABASE_MAX_ROWS_PER_REQUEST) {
			return allRows;
		}
	}
}
