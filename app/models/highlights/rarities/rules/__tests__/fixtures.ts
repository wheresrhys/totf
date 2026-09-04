import type {
	FirstEverSpeciesHighlight,
	FirstOfYearSpeciesHighlight,
	MegaSpeciesHighlight,
	RareSpeciesHighlight
} from '../../types';

export function firstOfYear(
	speciesName: string,
	isOnlyRecord: boolean,
	multipleIndividualsRecorded = false
): FirstOfYearSpeciesHighlight {
	return {
		type: 'first-of-year-species',
		speciesName,
		year: 2026,
		isCurrentYear: true,
		multipleIndividualsRecorded,
		isOnlyRecord
	};
}

export function firstEver(
	speciesName: string,
	isOnlyRecord: boolean,
	multipleIndividualsRecorded = false
): FirstEverSpeciesHighlight {
	return {
		type: 'first-ever-species',
		speciesName,
		multipleIndividualsRecorded,
		isOnlyRecord
	};
}

export function rare(
	speciesName: string,
	totalSessionDays = 3
): RareSpeciesHighlight {
	return {
		type: 'rare-species',
		speciesName,
		totalSessionDays
	};
}

export function mega(
	base: MegaSpeciesHighlight['base'],
	totalSessionDays: number
): MegaSpeciesHighlight {
	return {
		type: 'mega-species',
		base,
		totalSessionDays
	};
}
