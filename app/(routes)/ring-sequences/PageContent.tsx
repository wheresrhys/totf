'use client';
import { useState } from 'react';
import type { RingSequenceRow } from '@/app/models/db';
import {
	groupRingSequencesBySize,
	type RingSequenceSizeGroup,
	type UnassignedImportPrefix
} from '@/app/models/ring-sequences';
import type { ViewedGroup } from '@/lib/group-slug';
import { AccordionItem } from '@/app/components/shared/Accordion';
import {
	BoxyList,
	PageWrapper,
	PrimaryHeading,
	SecondaryHeading
} from '@/app/components/shared/DesignSystem';
import { RingSequenceDetail } from '@/app/components/pages/ring-sequences/RingSequenceDetail';
import { RingSequenceEditModal } from '@/app/components/RingSequenceEditModal';
import { CreateSequenceFromPrefix } from '@/app/components/pages/ring-sequences/CreateSequenceFromPrefix';

// Composite payload the Ring Sequences page renders: the group's existing
// sequences plus the unassigned import prefixes offered for creation (#697).
export type RingSequencesPageData = {
	sequences: RingSequenceRow[];
	unassignedPrefixes: UnassignedImportPrefix[];
};

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

// Top-of-page list of first-3-character prefixes belonging to newly-ringed
// birds not yet assigned to a sequence. Each is a button that opens the
// create-sequence modal for that prefix.
function UnassignedPrefixes({
	prefixes,
	onSelect
}: {
	prefixes: UnassignedImportPrefix[];
	onSelect: (prefix: UnassignedImportPrefix) => void;
}) {
	return (
		<section data-testid="unassigned-prefixes" className="mb-6">
			<SecondaryHeading>Unassigned import prefixes</SecondaryHeading>
			<p className="text-base-content/60 mb-2 text-sm">
				Newly-ringed birds not yet assigned to a sequence. Pick a prefix to
				create a sequence for it.
			</p>
			<ul className="flex flex-wrap gap-2">
				{prefixes.map((prefix) => (
					<li key={prefix.prefix}>
						<button
							type="button"
							className="btn btn-sm btn-outline"
							data-testid={`unassigned-prefix-${prefix.prefix}`}
							onClick={() => onSelect(prefix)}
						>
							<span className="font-bold">{prefix.prefix}</span>
							<span className="opacity-60">({prefix.ring_nos.length})</span>
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}

export function RingSequencesPageContent({
	data,
	viewedGroup
}: {
	data: RingSequencesPageData;
	viewedGroup: ViewedGroup;
}) {
	const [expandedId, setExpandedId] = useState<string | false>(false);
	const [editingSequence, setEditingSequence] =
		useState<RingSequenceRow | null>(null);
	const [creatingPrefix, setCreatingPrefix] =
		useState<UnassignedImportPrefix | null>(null);
	const { sequences, unassignedPrefixes } = data;
	const ringSizeGroups = groupRingSequencesBySize(sequences);

	return (
		<PageWrapper>
			<PrimaryHeading>Ring Sequences</PrimaryHeading>
			{unassignedPrefixes.length > 0 && (
				<UnassignedPrefixes
					prefixes={unassignedPrefixes}
					onSelect={setCreatingPrefix}
				/>
			)}
			{sequences.length === 0 ? (
				<p data-testid="ring-sequences-empty">
					No ring sequences yet. Create one from an unassigned import prefix
					above, or re-import your data.
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
			{creatingPrefix && (
				<CreateSequenceFromPrefix
					prefix={creatingPrefix.prefix}
					ringNos={creatingPrefix.ring_nos}
					viewedGroupId={viewedGroup.id}
					onClose={() => setCreatingPrefix(null)}
				/>
			)}
		</PageWrapper>
	);
}
