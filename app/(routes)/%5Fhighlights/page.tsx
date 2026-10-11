import { notFound } from 'next/navigation';
import { catchSupabaseErrors } from '@/lib/supabase';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { canReportHighlights } from '@/app/lib/qa-reporting';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import type { Database } from '@/types/supabase.types';

type HighlightReportRow =
	Database['public']['Tables']['HighlightReports']['Row'];

async function fetchHighlightReports(): Promise<HighlightReportRow[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return (await supabase
		.from('HighlightReports')
		.select('*')
		.order('created_at', { ascending: false })
		.then(catchSupabaseErrors)) as HighlightReportRow[];
}

// Deliberately unlinked admin listing of every submitted highlight report
// (#1122) — gated by the same production + qa cookie check as the report
// button itself, so there's nothing new to lock down here. Not following the
// usual page/PageContent/dataFetcher split: this page has no client-
// interactive content at all, so that split would be pure overhead.
export default async function HighlightReportsAdminPage() {
	if (!(await canReportHighlights())) {
		notFound();
	}
	const reports = await fetchHighlightReports();

	return (
		<PageWrapper>
			<PrimaryHeading>Highlight reports</PrimaryHeading>
			<table className="table">
				<thead>
					<tr>
						<th>Reported at</th>
						<th>Page</th>
						<th>Highlight</th>
						<th>Reason</th>
						<th>Highlight body</th>
					</tr>
				</thead>
				<tbody>
					{reports.map((report) => (
						<tr key={report.id}>
							<td>{report.created_at}</td>
							<td>{report.page_url}</td>
							<td>{report.highlight_text}</td>
							<td>{report.reason}</td>
							<td>
								<pre className="text-xs whitespace-pre-wrap">
									{JSON.stringify(report.highlight_body, null, 2)}
								</pre>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</PageWrapper>
	);
}
