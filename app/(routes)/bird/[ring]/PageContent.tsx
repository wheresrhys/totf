import { SingleBirdTable } from '@/app/components/SingleBirdTable';
import { format as formatDate } from 'date-fns';
import {
	BadgeList,
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { enrichBird, type StandaloneBird } from '@/app/models/bird';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import { EncountersTimeline } from '@/app/components/EncountersTimeline';
import type { ViewedGroup } from '@/lib/group-slug';

export type PageParams = { ring: string };

export function BirdPageContent({
	params: { ring },
	data: bird,
	viewedGroup
}: {
	params: PageParams;
	data: StandaloneBird;
	viewedGroup: ViewedGroup;
}) {
	const enrichedBird = bird.encounters.length ? enrichBird(bird) : null;
	const sharedEncounterCount = enrichedBird
		? enrichedBird.encounters.filter(
				(e) => e.ringing_group_id !== viewedGroup.id
			).length
		: 0;
	return (
		<PageWrapper>
			<PrimaryHeading>
				<NoPrefetchLink
					className="link"
					href={`/species/${bird.species?.species_name}`}
				>
					{bird.species?.species_name}
				</NoPrefetchLink>{' '}
				{ring}
			</PrimaryHeading>
			{enrichedBird ? (
				<>
					<BadgeList
						testId="bird-stats"
						items={
							[
								`${enrichedBird.encounters.length} encounters`,
								sharedEncounterCount > 0
									? `${sharedEncounterCount} from another group`
									: null,
								`First: ${formatDate(enrichedBird.firstEncounterDate, 'dd MMMM yyyy')}`,
								`Last: ${formatDate(enrichedBird.lastEncounterDate, 'dd MMMM yyyy')}`,
								`Sex: ${enrichedBird.sex}${enrichedBird.sexCertainty < 0.5 ? `?` : ''}`,
								`Proven Age: ${enrichedBird.proven_age}`
							].filter(Boolean) as string[]
						}
					/>
					<div className="m-2">
						<EncountersTimeline encounters={enrichedBird.encounters} />
					</div>
					<SingleBirdTable encounters={enrichedBird.encounters} />
				</>
			) : (
				<p>Not authorised to access any encounters for this bird</p>
			)}
		</PageWrapper>
	);
}
