import { SessionSpeciesTotalsTable } from './SessionSpeciesTotalsTable';
import type { SessionTabParams } from './session-tab-config';

export function SessionMistNettingTab({
	params: { mistNetSpeciesList }
}: {
	params: SessionTabParams;
}) {
	return (
		<SessionSpeciesTotalsTable
			speciesList={mistNetSpeciesList}
			testId="session-table"
		/>
	);
}
