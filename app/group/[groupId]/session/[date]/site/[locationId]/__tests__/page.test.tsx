import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

vi.mock('@/app/actions/session-highlights', () => ({
	// The action returns plain highlight data; the component renders each
	fetchSessionHighlights: vi.fn().mockResolvedValue([
		{
			type: 'session-total-record',
			metric: 'encounters',
			scope: 'all-time',
			value: 1,
			seasonName: 'winter',
			year: 2024,
			isCurrentYear: false,
			isCurrentSeason: false,
			seasonPeriodLabel: 'winter 2023/24'
		}
	])
}));

const TEST_DATE = '2024-03-15';
const TEST_GROUP_ID = '1';
const TEST_LOCATION_ID = '10';

const mockSessions = [
	{
		id: 1,
		location_id: 10,
		location: { id: 10, location_name: 'Test Reserve', ringing_group_id: 1 }
	}
];

const mockEncounters = [
	{
		id: 1,
		session_id: 1,
		age_code: 4,
		breeding_condition: null,
		capture_time: '08:00:00',
		moult_code: null,
		record_type: 'N',
		ringing_group_id: 1,
		sex: 'M',
		sexing_method: null,
		weight: 18.5,
		wing_length: 75,
		bird: {
			ring_no: 'ABC001',
			proven_age: 4,
			species: { id: 1, species_name: 'Robin' }
		}
	}
];

const mockPreviousSession = [{ visit_date: '2024-03-01' }];
const mockNextSession = [{ visit_date: '2024-04-01' }];

function makeSessionClient() {
	const makeChain = (data: unknown) => ({
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		in: vi.fn().mockReturnThis(),
		lt: vi.fn().mockReturnThis(),
		gt: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data, error: null }).then(resolve)
	});
	return {
		from: vi
			.fn()
			.mockReturnValueOnce(makeChain(mockSessions))
			.mockReturnValueOnce(makeChain(mockPreviousSession))
			.mockReturnValueOnce(makeChain(mockNextSession))
			.mockReturnValueOnce(makeChain(mockEncounters))
	};
}

function renderPage() {
	return Page({
		params: Promise.resolve({
			groupId: TEST_GROUP_ID,
			date: TEST_DATE,
			locationId: TEST_LOCATION_ID
		})
	});
}

describe('session site page', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(() => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeSessionClient());
	});

	it('renders date as heading', async () => {
		render(await renderPage());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toContain('15th March 2024');
	});

	it('does not render highlights on the location-filtered page', async () => {
		render(await renderPage());
		await screen.findByTestId('session-stats');
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		expect(screen.queryByTestId('session-highlights')).toBeNull();
		expect(vi.mocked(fetchSessionHighlights)).not.toHaveBeenCalled();
	});
});
