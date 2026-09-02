'use client';
import { useState, useEffect } from 'react';
import {
	fetchRingSequenceBirds,
	type RingSequenceBirdRow
} from '@/app/actions/ring-sequences';
import { findUnusedRings } from '@/app/models/ring-sequences';
import { AccordionItem } from '@/app/components/shared/Accordion';
import { BoxyList, InlineTable } from '@/app/components/shared/DesignSystem';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';

type SequenceDetailModel = {
	id: number;
	prefix: string;
};

type SpeciesGroup = {
	speciesName: string;
	rings: RingSequenceBirdRow[];
};

function groupBySpecies(rows: RingSequenceBirdRow[]): SpeciesGroup[] {
	const map = new Map<string, RingSequenceBirdRow[]>();
	for (const row of rows) {
		const existing = map.get(row.species_name) ?? [];
		existing.push(row);
		map.set(row.species_name, existing);
	}
	return Array.from(map.entries()).map(([speciesName, rings]) => ({
		speciesName,
		rings
	}));
}

function SpeciesHeading({ model }: { model: SpeciesGroup }) {
	return (
		<span>
			<span className="font-bold">{model.speciesName}</span>{' '}
			<span>({model.rings.length})</span>
		</span>
	);
}

function SpeciesContent({
	model,
	expandedId
}: {
	model: SpeciesGroup;
	expandedId: string | false;
}) {
	const isExpanded = expandedId === model.speciesName;
	if (!isExpanded) return null;
	return (
		<InlineTable>
			<thead>
				<tr>
					<th>Ring</th>
					<th>Date ringed</th>
				</tr>
			</thead>
			<tbody>
				{model.rings.map((ring) => (
					<tr key={ring.ring_no}>
						<td>
							<NoPrefetchLink className="link" href={`/bird/${ring.ring_no}`}>
								{ring.ring_no}
							</NoPrefetchLink>
						</td>
						<td>{ring.ringed_date}</td>
					</tr>
				))}
			</tbody>
		</InlineTable>
	);
}

export function RingSequenceDetail({
	model,
	expandedId
}: {
	model: SequenceDetailModel;
	expandedId: string | false;
}) {
	const accordionId = String(model.id);
	const isExpanded = expandedId === accordionId;

	const [data, setData] = useState<RingSequenceBirdRow[] | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoaded, setIsLoaded] = useState(false);
	const [expandedSpecies, setExpandedSpecies] = useState<string | false>(false);

	useEffect(() => {
		if (!isExpanded || isLoaded) return;
		let cancelled = false;
		setTimeout(() => {
			if (!cancelled) setIsLoading(true);
		}, 100);
		fetchRingSequenceBirds(model.id)
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
	}, [isExpanded, isLoaded, model.id]);

	if (!isExpanded) return null;

	if (isLoading) {
		return <span className="loading loading-spinner loading-xl"></span>;
	}

	if (!data) return null;

	const unusedRings = findUnusedRings(
		data.map((r) => r.ring_no),
		model.prefix.length
	);
	const speciesGroups = groupBySpecies(data);

	return (
		<div className="py-3">
			{unusedRings.length > 0 && (
				<p data-testid="unused-rings">
					<span className="font-bold">Unused rings:</span>{' '}
					{unusedRings.join(', ')}
				</p>
			)}
			<BoxyList>
				{speciesGroups.map((group) => (
					<AccordionItem
						key={group.speciesName}
						id={group.speciesName}
						model={group}
						onToggle={setExpandedSpecies}
						expandedId={expandedSpecies}
						HeadingComponent={SpeciesHeading}
						ContentComponent={SpeciesContent}
					/>
				))}
			</BoxyList>
		</div>
	);
}
