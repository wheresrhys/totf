'use client';
import { useState, useEffect } from 'react';
import {
	fetchRingSequenceControls,
	type RingSequenceControlRow
} from '@/app/actions/ring-sequences';
import { InlineTable } from './shared/DesignSystem';
import { NoPrefetchLink } from './shared/NoPrefetchLink';

export function RingSequenceControls({
	viewedGroupId,
	isExpanded
}: {
	viewedGroupId: number;
	isExpanded: boolean;
}) {
	const [data, setData] = useState<RingSequenceControlRow[] | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoaded, setIsLoaded] = useState(false);

	useEffect(() => {
		if (!isExpanded || isLoaded) return;
		let cancelled = false;
		setTimeout(() => {
			if (!cancelled) setIsLoading(true);
		}, 100);
		fetchRingSequenceControls(viewedGroupId)
			.then((result) => {
				if (!cancelled) setData(result);
			})
			.catch(console.error)
			.finally(() => {
				cancelled = true;
				setIsLoaded(true);
				setIsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [isExpanded, isLoaded, viewedGroupId]);

	if (!isExpanded) return null;

	if (isLoading) {
		return <span className="loading loading-spinner loading-xl"></span>;
	}

	if (!data || data.length === 0) {
		return <p className="py-3">No control birds found.</p>;
	}

	return (
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
	);
}
