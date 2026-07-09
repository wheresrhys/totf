import type { RingSequenceControlRow } from '@/app/actions/ring-sequences';
import {
	InlineTable,
	PageWrapper,
	PrimaryHeading
} from './shared/DesignSystem';
import { NoPrefetchLink } from './shared/NoPrefetchLink';

export function ControlsPage({
	data
}: {
	params: Record<string, string>;
	data: RingSequenceControlRow[];
	viewedGroupId: number;
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
