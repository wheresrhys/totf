'use client';
import { useState } from 'react';
import type { RingSequenceControlRow } from '@/app/actions/ring-sequences';
import type { ViewedGroup } from '@/lib/group-slug';
import {
	InlineTable,
	PageWrapper,
	PrimaryHeading
} from './shared/DesignSystem';
import { NoPrefetchLink } from './shared/NoPrefetchLink';
import { PromoteControlModal } from './PromoteControlModal';

export function ControlsPage({
	data,
	viewedGroup
}: {
	params: Record<string, string>;
	data: RingSequenceControlRow[];
	viewedGroup: ViewedGroup;
}) {
	// The control ring currently pending promotion (drives the modal), or null.
	const [promotingRingNo, setPromotingRingNo] = useState<string | null>(null);

	if (!data || data.length === 0) {
		return (
			<PageWrapper>
				<PrimaryHeading>Controls</PrimaryHeading>
				<p>No control birds found.</p>
			</PageWrapper>
		);
	}

	return (
		<PageWrapper>
			<PrimaryHeading>Controls</PrimaryHeading>
			<InlineTable testId="controls-table">
				<thead>
					<tr>
						<th>Ring</th>
						<th>Species</th>
						<th>First date</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{data.map((row) => (
						<tr key={row.ring_no}>
							<td>
								<NoPrefetchLink className="link" href={`/bird/${row.ring_no}`}>
									{row.ring_no}
								</NoPrefetchLink>
							</td>
							<td>{row.species_name}</td>
							<td>{row.first_date}</td>
							<td>
								<button
									type="button"
									className="btn btn-xs btn-outline"
									data-testid={`promote-control-${row.ring_no}`}
									onClick={() => setPromotingRingNo(row.ring_no)}
								>
									Promote to sequence
								</button>
							</td>
						</tr>
					))}
				</tbody>
			</InlineTable>
			{promotingRingNo && (
				<PromoteControlModal
					ringNo={promotingRingNo}
					viewedGroupId={viewedGroup.id}
					onClose={() => setPromotingRingNo(null)}
				/>
			)}
		</PageWrapper>
	);
}
