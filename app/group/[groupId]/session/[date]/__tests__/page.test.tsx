import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const TEST_DATE = '2024-03-15';
const TEST_GROUP_ID = '1';

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
		capture_time: '08:00:00',
		record_type: 'N',
		ringing_group_id: 1,
		sex: 'M',
		weight: 18.5,
		wing_length: 75,
		bird: { ring_no: 'ABC001', species: { id: 1, species_name: 'Robin' } }
	},
	{
		id: 2,
		session_id: 1,
		age_code: 1,
		capture_time: '08:15:00',
		record_type: 'S',
		ringing_group_id: 1,
		sex: 'F',
		weight: null,
		wing_length: null,
		bird: { ring_no: 'XYZ002', species: { id: 1, species_name: 'Robin' } }
	},
	{
		id: 3,
		session_id: 1,
		age_code: 2,
		capture_time: '08:30:00',
		record_type: 'N',
		ringing_group_id: 1,
		sex: 'U',
		weight: 11.0,
		wing_length: 55,
		bird: { ring_no: 'DEF003', species: { id: 2, species_name: 'Blue Tit' } }
	}
];

function makeSessionClient() {
	const makeChain = (data: unknown) => ({
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		in: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data, error: null }).then(resolve)
	});
	return {
		from: vi
			.fn()
			.mockReturnValueOnce(makeChain(mockSessions))
			.mockReturnValueOnce(makeChain(mockEncounters))
	};
}

function renderPage() {
	return Page({
		params: Promise.resolve({ groupId: TEST_GROUP_ID, date: TEST_DATE })
	});
}

describe('session detail page', () => {
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

	it('renders total bird and species counts', async () => {
		render(await renderPage());
		const stats = await screen.findByTestId('session-stats');
		expect(stats.textContent).toContain('3 birds');
		expect(stats.textContent).toContain('2 species');
	});

	it('renders new and retrap counts', async () => {
		render(await renderPage());
		const stats = await screen.findByTestId('session-stats');
		expect(stats.textContent).toContain('2 new');
		expect(stats.textContent).toContain('1 retraps');
	});

	it('renders one table row per species', async () => {
		render(await renderPage());
		const table = await screen.findByTestId('session-table');
		const rows = table.querySelectorAll('tbody tr');
		expect(rows.length).toBe(2);
	});
});
