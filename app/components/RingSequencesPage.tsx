'use client';
import { useState } from 'react';
import type { RingSequenceRow } from '@/app/models/db';
import {
	groupRingSequencesBySize,
	type RingSequenceSizeGroup
} from '@/app/models/ring-sequences';
import { AccordionItem } from './shared/Accordion';
import {
	BoxyList,
	PageWrapper,
	PrimaryHeading,
	SecondaryHeading
} from './shared/DesignSystem';
import { RingSequenceDetail } from './RingSequenceDetail';
import { RingSequenceEditModal } from './RingSequenceEditModal';

type SequenceRowModel = {
	sequence: RingSequenceRow;
	onEdit: (sequence: RingSequenceRow) => void;
};

function formatRingRange(sequence: RingSequenceRow): string | null {
	const { first_ring, last_ring } = sequence;
	if (!first_ring && !last_ring) return null;
	if (first_ring && last_ring) return `${first_ring} – ${last_ring}`;
	return first_ring ?? last_ring;
}

function SequenceHeading({ model }: { model: SequenceRowModel }) {
	const { sequence, onEdit } = model;
	const range = formatRingRange(sequence);
	return (
		<span className="flex items-center gap-2">
			<span className="font-bold">{sequence.prefix}</span>
			{range && (
				<>
					{' — '}
					<span>{range}</span>
				</>
			)}
			{/* A span (not a nested <button>) so it is valid inside the
			    AccordionItem's header <button>; stopPropagation keeps a click
			    from also toggling the accordion. */}
			<span
				role="button"
				tabIndex={0}
				className="btn btn-xs btn-outline"
				data-testid={`edit-sequence-${sequence.id}`}
				onClick={(event) => {
					event.stopPropagation();
					onEdit(sequence);
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.stopPropagation();
						onEdit(sequence);
					}
				}}
			>
				Edit
			</span>
		</span>
	);
}

function SequenceContent({
	model,
	expandedId
}: {
	model: SequenceRowModel;
	expandedId: string | false;
}) {
	return (
		<RingSequenceDetail
			model={{ id: model.sequence.id, prefix: model.sequence.prefix }}
			expandedId={expandedId}
		/>
	);
}

function RingSizeSection({
	group,
	expandedId,
	onToggle,
	onEdit
}: {
	group: RingSequenceSizeGroup;
	expandedId: string | false;
	onToggle: (id: string | false) => void;
	onEdit: (sequence: RingSequenceRow) => void;
}) {
	const isMissingSize = group.size === null;
	return (
		<li data-testid={`ring-size-${group.size ?? 'missing'}`}>
			<SecondaryHeading>
				{isMissingSize ? (
					<span
						className="badge badge-warning"
						data-testid="missing-size-badge"
					>
						Missing size
					</span>
				) : (
					group.size
				)}{' '}
				<span className="text-base-content/60 text-base">
					({group.sequences.length})
				</span>
			</SecondaryHeading>
			<ul className="divide-base-content/25 divide-y">
				{group.sequences.map((sequence) => {
					const id = String(sequence.id);
					return (
						<AccordionItem
							key={id}
							id={id}
							model={{ sequence, onEdit }}
							onToggle={onToggle}
							expandedId={expandedId}
							HeadingComponent={SequenceHeading}
							ContentComponent={SequenceContent}
							testId={`sequence-${id}`}
						/>
					);
				})}
			</ul>
		</li>
	);
}

export function RingSequencesPage({ data }: { data: RingSequenceRow[] }) {
	const [expandedId, setExpandedId] = useState<string | false>(false);
	const [editingSequence, setEditingSequence] =
		useState<RingSequenceRow | null>(null);
	const ringSizeGroups = groupRingSequencesBySize(data);

	return (
		<PageWrapper>
			<PrimaryHeading>Ring Sequences</PrimaryHeading>
			{data.length === 0 ? (
				<p data-testid="ring-sequences-empty">
					No ring sequences yet. Re-import your data to populate them.
				</p>
			) : (
				<BoxyList>
					{ringSizeGroups.map((group) => (
						<RingSizeSection
							key={group.size ?? 'missing'}
							group={group}
							expandedId={expandedId}
							onToggle={setExpandedId}
							onEdit={setEditingSequence}
						/>
					))}
				</BoxyList>
			)}
			{editingSequence && (
				<RingSequenceEditModal
					sequence={editingSequence}
					onClose={() => setEditingSequence(null)}
				/>
			)}
		</PageWrapper>
	);
}
