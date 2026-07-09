'use client';
import { useState, useEffect } from 'react';
import {
	fetchRingSequenceDetail,
	type RingSequenceDetailRow
} from '@/app/actions/ring-sequences';
import { findUnusedRings } from '@/app/models/ring-sequences';
import { AccordionItem } from './shared/Accordion';
import { BoxyList, InlineTable } from './shared/DesignSystem';

type SequenceDetailModel = {
	sequencePrefix: string;
	ringLength: number;
	viewedGroupId: number;
};

type SpeciesGroup = {
	speciesName: string;
	rings: RingSequenceDetailRow[];
};

function groupBySpecies(rows: RingSequenceDetailRow[]): SpeciesGroup[] {
	const map = new Map<string, RingSequenceDetailRow[]>();
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
						<td>{ring.ring_no}</td>
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
	const accordionId = `${model.sequencePrefix}-${model.ringLength}`;
	const isExpanded = expandedId === accordionId;

	const [data, setData] = useState<RingSequenceDetailRow[] | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoaded, setIsLoaded] = useState(false);
	const [expandedSpecies, setExpandedSpecies] = useState<string | false>(false);

	useEffect(() => {
		if (!isExpanded || isLoaded) return;
		let cancelled = false;
		setTimeout(() => {
			if (!cancelled) setIsLoading(true);
		}, 100);
		fetchRingSequenceDetail(
			model.sequencePrefix,
			model.ringLength,
			model.viewedGroupId
		)
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
	}, [
		isExpanded,
		isLoaded,
		model.sequencePrefix,
		model.ringLength,
		model.viewedGroupId
	]);

	if (!isExpanded) return null;

	if (isLoading) {
		return <span className="loading loading-spinner loading-xl"></span>;
	}

	if (!data) return null;

	const unusedRings = findUnusedRings(
		data.map((r) => r.ring_no),
		model.sequencePrefix.length
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
