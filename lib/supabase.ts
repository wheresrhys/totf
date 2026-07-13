import {
	createClient,
	type PostgrestSingleResponse
} from '@supabase/supabase-js';

import type { Database } from '@/types/supabase.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

export function createSupabaseClientWithJwt(jwt: string) {
	return createClient<Database>(supabaseUrl, supabaseAnonKey, {
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
