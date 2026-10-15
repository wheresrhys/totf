import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { ViewedGroup } from '@/app/lib/group-slug';

export async function fetchYears(viewedGroup: ViewedGroup): Promise<number[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	const dates = (await supabase
		.from('Sessions')
		.select('visit_date')
		.eq('ringing_group_id', viewedGroup.id)
		.order('visit_date', { ascending: false })
		.then(catchSupabaseErrors)) as { visit_date: string }[];

	return [
		...new Set(dates.map((date) => new Date(date.visit_date).getFullYear()))
	] as number[];
}
