import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const SPECIES_ID = 42;
const GROUP_ID = 1;
const PAGE_SIZE = 1000;

// Queries are paginated (PostgREST caps responses at 1000 rows), so the
// mock builder serves rows page by page from this array
let birdPages: { encounters: { sex: string | null }[] }[][];

const mockOrder = vi.fn();
const mockRange = vi.fn();
const mockContains = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const birdsQueryBuilder = {
	select: mockSelect,
	eq: mockEq,
	contains: mockContains,
	order: mockOrder,
	range: mockRange
};

function buildBird(sex: string | null = null) {
	return {
		encounters: [{ age_code: '3', sex, weight: 10, wing_length: 60 }]
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	birdPages = [[buildBird('M'), buildBird(null)]];
	mockSelect.mockReturnValue(birdsQueryBuilder);
	mockEq.mockReturnValue(birdsQueryBuilder);
	mockContains.mockReturnValue(birdsQueryBuilder);
	mockOrder.mockReturnValue(birdsQueryBuilder);
	mockRange.mockImplementation((fromRow: number) =>
		Promise.resolve({
			data: birdPages[fromRow / PAGE_SIZE] ?? [],
			error: null
		})
	);
	mockFrom.mockReturnValue(birdsQueryBuilder);
	mockGetAuthenticatedSupabaseClient.mockResolvedValue({ from: mockFrom });
});

async function importFetchGraphableEncounterData() {
	vi.resetModules();
	const { fetchGraphableEncounterData } = await import('../sp-data');
	return fetchGraphableEncounterData;
}

describe('fetchGraphableEncounterData', () => {
	it('returns sexed graphable birds with species and group filters', async () => {
		const fetchGraphableEncounterData =
			await importFetchGraphableEncounterData();
		const birds = await fetchGraphableEncounterData(SPECIES_ID, GROUP_ID);
		expect(mockFrom).toHaveBeenCalledWith('Birds');
		expect(mockEq).toHaveBeenCalledWith('species_id', SPECIES_ID);
		expect(mockContains).toHaveBeenCalledWith('ringing_group_ids', [GROUP_ID]);
		expect(birds).toHaveLength(2);
		// enriched via getSexOfBird
		expect(birds[0]).toEqual(expect.objectContaining({ sex: 'M' }));
	});

	it('orders by bird id for stable pagination', async () => {
		const fetchGraphableEncounterData =
			await importFetchGraphableEncounterData();
		await fetchGraphableEncounterData(SPECIES_ID, GROUP_ID);
		expect(mockOrder).toHaveBeenCalledWith('id');
		expect(mockRange).toHaveBeenCalledWith(0, PAGE_SIZE - 1);
	});

	it('fetches birds beyond the first page', async () => {
		birdPages = [
			Array.from({ length: PAGE_SIZE }, () => buildBird()),
			[buildBird('F')]
		];
		const fetchGraphableEncounterData =
			await importFetchGraphableEncounterData();
		const birds = await fetchGraphableEncounterData(SPECIES_ID, GROUP_ID);
		expect(mockRange).toHaveBeenCalledTimes(2);
		expect(mockRange).toHaveBeenNthCalledWith(2, PAGE_SIZE, 2 * PAGE_SIZE - 1);
		expect(birds).toHaveLength(PAGE_SIZE + 1);
	});
});
