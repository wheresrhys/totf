import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ALPHA_CORE_STATS_BY_SPECIES } from '@/app/__tests__/helpers/core-stats-fixtures';
import { fetchSpeciesComparisonStats } from '../compare-species';
import type { ViewedGroup } from '@/app/lib/group-slug';

const { mockReadStatsCacheRows } = vi.hoisted(() => ({
	mockReadStatsCacheRows: vi.fn()
}));

// `readStatsCacheRows` is the action's one collaborator, mocked at the module
// barrel rather than reached past it (see `CLAUDE.md`'s module-boundary rule).
vi.mock('@/modules/stats', () => ({
	readStatsCacheRows: mockReadStatsCacheRows
}));

const GROUP_ID = 7;
const viewedGroup: ViewedGroup = { id: GROUP_ID, slug: 'alpha' };

// Alpha's captured all-time by-species cache rows, which already carry both
// metric families' columns (counts *and* the 8 wing/weight ones) on every row
// — the shape the reader really returns.
const [blueTitRow, fieldfareRow] = ALPHA_CORE_STATS_BY_SPECIES;

describe('fetchSpeciesComparisonStats', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockReadStatsCacheRows.mockResolvedValue([]);
	});

	it('reads the by-species cache at the all-time grain for the viewed group', async () => {
		await fetchSpeciesComparisonStats(viewedGroup);

		expect(mockReadStatsCacheRows).toHaveBeenCalledTimes(1);
		expect(mockReadStatsCacheRows).toHaveBeenCalledWith({
			viewedGroup,
			bySpecies: true,
			temporalUnit: 'all-time'
		});
	});

	it('returns each cache row whole, with both metric families on it', async () => {
		mockReadStatsCacheRows.mockResolvedValue([blueTitRow]);

		const speciesStats = await fetchSpeciesComparisonStats(viewedGroup);

		expect(Array.isArray(speciesStats)).toBe(true);
		expect(speciesStats).toHaveLength(1);
		expect(speciesStats[0].species_name).toBe(blueTitRow.species_name);
		expect(speciesStats[0].encounter_count).toBe(blueTitRow.encounter_count);
		expect(speciesStats[0].avg_weight).toBe(blueTitRow.avg_weight);
	});

	it('returns every row the reader paginated, in the order it returned them', async () => {
		mockReadStatsCacheRows.mockResolvedValue([fieldfareRow, blueTitRow]);

		const speciesStats = await fetchSpeciesComparisonStats(viewedGroup);

		expect(speciesStats.map((row) => row.species_name)).toEqual([
			fieldfareRow.species_name,
			blueTitRow.species_name
		]);
	});

	it('returns an empty list when the group has no cached by-species rows', async () => {
		expect(await fetchSpeciesComparisonStats(viewedGroup)).toEqual([]);
	});
});
