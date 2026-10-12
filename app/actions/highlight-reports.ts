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

export type DismissHighlightReportState =
	| { success: true }
	| { success: false; error: string }
	| null;

export async function dismissHighlightReport(
	_prevState: DismissHighlightReportState,
	formData: FormData
): Promise<DismissHighlightReportState> {
	if (!(await canReportHighlights())) {
		return { success: false, error: 'Reporting is not enabled' };
	}

	const reportId = Number(formData.get('reportId'));
	if (!Number.isFinite(reportId)) {
		return { success: false, error: 'Malformed report id' };
	}

	try {
		const supabase = await getAuthenticatedSupabaseClient();
		await supabase
			.from('HighlightReports')
			.update({ is_dismissed: true })
			.eq('id', reportId)
			.then(catchSupabaseErrors);
		return { success: true };
	} catch (error) {
		console.error('Failed to dismiss highlight report', {
			reportId,
			error
		});
		return { success: false, error: 'Failed to dismiss report' };
	}
}
