// Alpha/ARRETRAP seed-data constants shared by more than one RPC's integration tests.
// Constants used by only one RPC's tests (e.g. aggregate_stats' ALPHA_SESSION_COUNT,
// ALPHA_TOTAL_ENCOUNTERS, ALPHA_SPECIES_COUNT, CES_2022_ENCOUNTERS; notable_retraps'
// ARRETRAP_PROVEN_AGE) live alongside their own test file instead.

// Total number of Alpha-group birds across the full seed dataset.
export const ALPHA_TOTAL_BIRDS = 46;

// Per-species aggregates for Alpha — reused across multiple RPCs' tests.
export const PER_SPECIES_AGGREGATES = {
	'Blue Tit': { encounter_count: 7, bird_count: 6 },
	Kingfisher: { encounter_count: 2, bird_count: 1 },
	'Reed Warbler': { encounter_count: 15, bird_count: 15 },
	Robin: { encounter_count: 31, bird_count: 23 },
	Wren: { encounter_count: 2, bird_count: 1 }
} as const;

// ARRETRAP is the seed's long-lived Robin, encountered on every one of these Alpha
// session dates (2021-06-20 → 2024-05-10).
export const ARRETRAP_ENCOUNTERS = 9;
export const ARRETRAP_DATES = [
	'2021-06-20',
	'2022-04-30',
	'2022-06-15',
	'2022-08-10',
	'2022-10-20',
	'2023-05-12',
	'2023-07-08',
	'2023-09-14',
	'2024-05-10'
];
