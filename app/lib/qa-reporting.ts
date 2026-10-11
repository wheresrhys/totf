import { cookies } from 'next/headers';

// Gates the highlight-reporting feature (#1122): visible only to QA testers
// poking at production, never in dev/preview and never without the cookie.
export async function canReportHighlights(): Promise<boolean> {
	if (process.env.VERCEL_ENV !== 'production') return false;
	const cookieStore = await cookies();
	return cookieStore.get('qa')?.value === 'true';
}
