'use client';
import { useCallback } from 'react';
import { SecondaryHeading } from '@/app/components/shared/DesignSystem';
import { fetchTopSessions } from '@/app/actions/sp-data';
import { StatOutput } from '@/app/components/shared/StatOutput';
import { useLazyTabData } from '@/app/components/shared/useLazyTabData';
import type { ViewedGroup } from '@/app/lib/group-slug';

// The Highlights tab's second section (#782) — the species' top 5 sessions by
// encounter count for the page's current scope, matching what the headline
// stats' "Top sessions" line showed before this ticket moved it here. Uses
// `useLazyTabData` (unlike `SpNotableRetrapsTab`'s hand-rolled fetch-on-mount,
// left as-is per the ticket) so it only fetches once this tab is selected.
export function SpBusiestSessionsTab({
	speciesName,
	viewedGroupId,
	viewedGroup,
	year,
	month,
	isActive
}: {
	speciesName: string;
	viewedGroupId: number;
	viewedGroup: ViewedGroup;
	year?: number;
	month?: number;
	isActive: boolean;
}) {
	const fetchBusiestSessions = useCallback(
		() => fetchTopSessions(speciesName, viewedGroupId, year, month),
		[speciesName, viewedGroupId, year, month]
	);
	const { data: topSessions, isLoading } = useLazyTabData(
		isActive,
		fetchBusiestSessions,
		{
			onError: (error) =>
				console.error('Failed to fetch species busiest sessions', {
					speciesName,
					viewedGroupId,
					year,
					month,
					error
				})
		}
	);

	const sessions = topSessions ?? [];

	return (
		<>
			<SecondaryHeading>Busiest sessions</SecondaryHeading>
			{isLoading ? (
				<div className="flex items-center justify-center">
					<div className="loading loading-spinner loading-xl"></div>
				</div>
			) : sessions.length > 0 ? (
				<ul className="flex items-center gap-2 flex-wrap">
					{sessions.map((session) => (
						<li key={session.visit_date}>
							<StatOutput
								value={session.metric_value}
								visitDate={session.visit_date}
								temporalUnit="day"
								classes="badge badge-outline"
								dateFormat="d MMM yyyy"
								viewedGroup={viewedGroup}
							/>
						</li>
					))}
				</ul>
			) : (
				<p>No busiest sessions found</p>
			)}
		</>
	);
}
