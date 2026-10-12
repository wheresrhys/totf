import { notFound } from 'next/navigation';
import { catchSupabaseErrors } from '@/lib/supabase';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { canReportHighlights } from '@/app/lib/qa-reporting';
import {
	PageWrapper,
	PrimaryHeading,
	BoxyList
} from '@/app/components/shared/DesignSystem';
import { HighlightReportBody } from '@/app/components/HighlightReportBody';
import { DismissHighlightReportButton } from '@/app/components/DismissHighlightReportButton';
import type { Database } from '@/types/supabase.types';

type HighlightReportRow =
	Database['public']['Tables']['HighlightReports']['Row'];

async function fetchHighlightReports(): Promise<HighlightReportRow[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return (await supabase
		.from('HighlightReports')
		.select('*')
		.eq('is_dismissed', false)
		.order('created_at', { ascending: false })
		.then(catchSupabaseErrors)) as HighlightReportRow[];
}

// Deliberately unlinked admin listing of every outstanding highlight report
// (#1122) — gated by the same production + qa cookie check as the report
// button itself, so there's nothing new to lock down here. Visiting this page
// in production is itself the activation step for the cookie: `proxy.ts` sets
// it on the request before this component ever runs, since a Server
// Component can't set cookies itself. Not following the usual
// page/PageContent/dataFetcher split: this page has no client-interactive
// content at all, so that split would be pure overhead — only the dismiss
// button and body toggle below are client components.
export default async function HighlightReportsAdminPage() {
	if (!(await canReportHighlights())) {
		notFound();
	}
	const reports = await fetchHighlightReports();

	return (
		<PageWrapper>
			<PrimaryHeading>Highlight reports</PrimaryHeading>
			<BoxyList>
				{reports.map((report) => (
					<li key={report.id} className="flex items-start justify-between">
						<dl className="flex flex-col gap-1">
							<div className="flex gap-2">
								<dt className="font-semibold">Reported at:</dt>
								<dd>{report.created_at}</dd>
							</div>
							<div className="flex gap-2">
								<dt className="font-semibold">Page:</dt>
								<dd>{report.page_url}</dd>
							</div>
							<div className="flex gap-2">
								<dt className="font-semibold">Highlight:</dt>
								<dd>{report.highlight_text}</dd>
							</div>
							<div className="flex gap-2">
								<dt className="font-semibold">Reason:</dt>
								<dd>{report.reason}</dd>
							</div>
							<HighlightReportBody highlightBody={report.highlight_body} />
						</dl>
						<DismissHighlightReportButton reportId={report.id} />
					</li>
				))}
			</BoxyList>
		</PageWrapper>
	);
}
