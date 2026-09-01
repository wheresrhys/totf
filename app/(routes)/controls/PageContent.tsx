import type { DefaultPageParams } from '@/app/components/layout/BootstrapPage';
import {
	fetchRingSequenceControls,
	type RingSequenceControlRow
} from '@/app/actions/ring-sequences';
import type { ViewedGroup } from '@/lib/group-slug';
import {
	InlineTable,
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';

export async function fetchControlsPageContent(
	_: DefaultPageParams,
	viewedGroupId: number
): Promise<RingSequenceControlRow[] | null> {
	return fetchRingSequenceControls(viewedGroupId);
}

export function ControlsPageContent({
	data
}: {
	params: Record<string, string>;
	data: RingSequenceControlRow[];
	viewedGroup: ViewedGroup;
}) {
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
						</tr>
					))}
				</tbody>
			</InlineTable>
		</PageWrapper>
	);
}
