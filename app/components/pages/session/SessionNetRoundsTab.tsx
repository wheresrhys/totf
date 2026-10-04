import { EncountersTable } from './EncountersTable';
import type { SessionTabParams } from './session-tab-config';

export function SessionNetRoundsTab({
	params: { netRounds }
}: {
	params: SessionTabParams;
}) {
	return (
		<div>
			{netRounds.map((round, index) => (
				<div key={round.startTime}>
					<h3 className="mt-4 mb-2 font-semibold">
						Net round {index + 1}: {round.startTime.slice(0, 5)}
					</h3>
					<EncountersTable
						encounters={round.encounters}
						size="responsive"
						showTimeColumn={false}
						showSpeciesColumn={true}
						testId="net-round-table"
					/>
				</div>
			))}
		</div>
	);
}
