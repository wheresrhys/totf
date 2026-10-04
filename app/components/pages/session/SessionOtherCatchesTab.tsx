import { SessionSpeciesTotalsTable } from './SessionSpeciesTotalsTable';
import type { SessionTabParams } from './session-tab-config';

export function SessionOtherCatchesTab({
	params: { otherCatchesSpeciesList }
}: {
	params: SessionTabParams;
}) {
	return (
		<SessionSpeciesTotalsTable
			speciesList={otherCatchesSpeciesList}
			testId="other-catches-table"
		/>
	);
}
