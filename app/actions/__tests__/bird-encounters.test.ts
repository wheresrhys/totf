import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchBirdEncounters } from '../bird-encounters';
import type { EncounterOfBird } from '@/app/models/bird';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const BIRD_ID = 1;

function encounter(id: number, visit_date: string): EncounterOfBird {
	return {
		id,
		bird_id: BIRD_ID,
		age_code: 4,
		breeding_condition: null,
		is_juv: false,
		capture_time: '09:00:00',
		max_hatch_year: 2020,
		min_hatch_year: 2020,
		moult_code: null,
		record_type: 'N',
		sex: 'U',
		sexing_method: null,
		ringing_group_id: 1,
		weight: null,
		wing_length: null,
		session: { visit_date }
	} as unknown as EncounterOfBird;
}

function makeClient(encounters: EncounterOfBird[]) {
	const makeBirdChain = () => ({
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data: { id: BIRD_ID }, error: null }).then(resolve)
	});
	const makeEncounterChain = () => ({
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data: encounters, error: null }).then(resolve)
	});
	return {
		from: vi
			.fn()
			.mockReturnValueOnce(makeBirdChain())
			.mockReturnValueOnce(makeEncounterChain())
	};
}

function makeNoBirdClient() {
	const makeBirdChain = () => ({
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data: null, error: null }).then(resolve)
	});
	return { from: vi.fn().mockReturnValueOnce(makeBirdChain()) };
}

describe('fetchBirdEncounters', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('usual cases', () => {
		it('returns encounters ordered by visit date descending, most recent first', async () => {
			const unordered = [
				encounter(1, '2022-04-30'),
				encounter(2, '2024-05-10'),
				encounter(3, '2023-07-08')
			];
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeClient(unordered)
			);

			const result = await fetchBirdEncounters('AB1234');

			expect(result.map((e) => e.id)).toEqual([2, 3, 1]);
		});
	});

	describe('edge cases', () => {
		it('returns an empty array when no bird matches the ring number', async () => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeNoBirdClient());

			const result = await fetchBirdEncounters('UNKNOWN');

			expect(result).toEqual([]);
		});

		it('returns a single encounter unchanged', async () => {
			const single = [encounter(1, '2022-04-30')];
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeClient(single));

			const result = await fetchBirdEncounters('AB1234');

			expect(result.map((e) => e.id)).toEqual([1]);
		});
	});
});
