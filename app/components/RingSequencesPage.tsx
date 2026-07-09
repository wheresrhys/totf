'use client';
import { useState } from 'react';
import type { RingSequenceSummary } from '@/app/actions/ring-sequences';
import {
	groupSummariesByRingSize,
	type RingSizeGroup
} from '@/app/models/ring-sequences';
import { AccordionItem } from './shared/Accordion';
import {
	BoxyList,
	PageWrapper,
	PrimaryHeading,
	SecondaryHeading
} from './shared/DesignSystem';
import { RingSequenceControls } from './RingSequenceControls';
import { RingSequenceDetail } from './RingSequenceDetail';

const CONTROLS_ID = 'controls';

type SequenceSummaryModel = {
	summary: RingSequenceSummary;
	viewedGroupId: number;
};

function SequenceHeading({ model }: { model: SequenceSummaryModel }) {
	const { summary } = model;
	return (
		<span>
			<span className="font-bold">{summary.sequence_prefix}</span>
			{' — '}
			<span>{summary.ring_count} rings</span>
			{', '}
			<span>
				{summary.earliest_date} – {summary.latest_date}
			</span>
		</span>
	);
}

function SequenceContent({
	model,
	expandedId
}: {
	model: SequenceSummaryModel;
	expandedId: string | false;
}) {
	return (
		<RingSequenceDetail
			model={{
				sequencePrefix: model.summary.sequence_prefix,
				ringLength: model.summary.ring_length,
				viewedGroupId: model.viewedGroupId
			}}
			expandedId={expandedId}
		/>
	);
}

function ControlsHeading() {
	return <span className="font-bold">Controls</span>;
}

function ControlsContent({
	model,
	expandedId
}: {
	model: { viewedGroupId: number };
	expandedId: string | false;
}) {
	return (
		<RingSequenceControls
			viewedGroupId={model.viewedGroupId}
			isExpanded={expandedId === CONTROLS_ID}
		/>
	);
}

function RingSizeSection({
	group,
	viewedGroupId,
	expandedId,
	onToggle
}: {
	group: RingSizeGroup;
	viewedGroupId: number;
	expandedId: string | false;
	onToggle: (id: string | false) => void;
}) {
	return (
		<li data-testid={`ring-size-${group.name}`}>
			<SecondaryHeading>
				{group.name} — {group.totalRingCount} rings
			</SecondaryHeading>
			<ul className="divide-base-content/25 divide-y">
				{group.summaries.map((summary) => {
					const id = `${summary.sequence_prefix}-${summary.ring_length}`;
					const summaryModel: SequenceSummaryModel = { summary, viewedGroupId };
					return (
						<AccordionItem
							key={id}
							id={id}
							model={summaryModel}
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

export function RingSequencesPage({
	data,
	viewedGroupId
}: {
	params: Record<string, string>;
	data: RingSequenceSummary[];
	viewedGroupId: number;
}) {
	const [expandedId, setExpandedId] = useState<string | false>(false);
	const ringSizeGroups = groupSummariesByRingSize(data);

	return (
		<PageWrapper>
			<PrimaryHeading>Ring Sequences</PrimaryHeading>
			<BoxyList>
				<AccordionItem
					id={CONTROLS_ID}
					model={{ viewedGroupId }}
					onToggle={setExpandedId}
					expandedId={expandedId}
					HeadingComponent={ControlsHeading}
					ContentComponent={ControlsContent}
					testId="controls-accordion"
				/>
				{ringSizeGroups.map((group) => (
					<RingSizeSection
						key={group.name}
						group={group}
						viewedGroupId={viewedGroupId}
						expandedId={expandedId}
						onToggle={setExpandedId}
					/>
				))}
			</BoxyList>
		</PageWrapper>
	);
}
