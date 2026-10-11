'use server';

import { catchSupabaseErrors } from '@/lib/supabase';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { canReportHighlights } from '@/app/lib/qa-reporting';
import type { Json } from '@/types/supabase.types';

export type ReportHighlightState =
	| { success: true }
	| { success: false; error: string }
	| null;

export async function reportHighlight(
	_prevState: ReportHighlightState,
	formData: FormData
): Promise<ReportHighlightState> {
	if (!(await canReportHighlights())) {
		return { success: false, error: 'Reporting is not enabled' };
	}

	const pageUrl = formData.get('pageUrl');
	const highlightText = formData.get('highlightText');
	const reason = formData.get('reason');
	const highlightBodyRaw = formData.get('highlightBody');

	if (typeof pageUrl !== 'string' || typeof highlightText !== 'string') {
		return { success: false, error: 'Malformed report' };
	}
	if (typeof reason !== 'string' || reason.trim() === '') {
		return { success: false, error: 'Please give a reason' };
	}

	let highlightBody: Json;
	try {
		highlightBody = JSON.parse(highlightBodyRaw as string);
	} catch {
		return { success: false, error: 'Malformed highlight data' };
	}

	try {
		const supabase = await getAuthenticatedSupabaseClient();
		await supabase
			.from('HighlightReports')
			.insert({
				page_url: pageUrl,
				highlight_text: highlightText,
				reason,
				highlight_body: highlightBody
			})
			.then(catchSupabaseErrors);
		return { success: true };
	} catch (error) {
		console.error('Failed to save highlight report', {
			pageUrl,
			highlightText,
			error
		});
		return { success: false, error: 'Failed to submit report' };
	}
}
