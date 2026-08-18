import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { notFound } from 'next/navigation';
import Page from '../page';

const { mockGetAuthenticatedSupabaseClient, mockResolveGroupIdBySlug } =
	vi.hoisted(() => ({
		mockGetAuthenticatedSupabaseClient: vi.fn(),
		mockResolveGroupIdBySlug: vi.fn()
	}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

vi.mock('@/lib/group-slug', () => ({
	resolveGroupIdBySlug: mockResolveGroupIdBySlug
}));

vi.mock('@/app/actions/session-highlights', () => ({
	// The action returns plain highlight data; the component renders each
	fetchSessionHighlights: vi.fn().mockResolvedValue([
		{
			type: 'session-total-record',
			metric: 'encounters',
			scope: 'all-time',
			value: 3,
			year: 2024,
			isCurrentYear: false
		}
	])
}));

const TEST_DATE = '2024-03-15';
const TEST_GROUP_ID = '1';
const TEST_GROUP_SLUG = 'test-group';

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
			proven_age: 5,
			species: { id: 1, species_name: 'Robin' }
		}
	},
	{
		id: 2,
		session_id: 1,
		age_code: 1,
		breeding_condition: null,
		capture_time: '08:15:00',
		moult_code: null,
		record_type: 'S',
		ringing_group_id: 1,
		sex: 'F',
		sexing_method: null,
		weight: null,
		wing_length: null,
		bird: {
			ring_no: 'XYZ002',
			proven_age: 2,
			species: { id: 1, species_name: 'Robin' }
		}
	},
	{
		id: 3,
		session_id: 1,
		age_code: 2,
		breeding_condition: null,
		capture_time: '08:30:00',
		moult_code: null,
		record_type: 'N',
		ringing_group_id: 1,
		sex: 'U',
		sexing_method: null,
		weight: 11.0,
		wing_length: 55,
		bird: {
			ring_no: 'DEF003',
			proven_age: 0,
			species: { id: 2, species_name: 'Blue Tit' }
		}
	}
];

const mockPreviousSession = [{ visit_date: '2024-03-01' }];
const mockNextSession = [{ visit_date: '2024-04-01' }];

function makeChain(data: unknown) {
	return {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		in: vi.fn().mockReturnThis(),
		lt: vi.fn().mockReturnThis(),
		gt: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data, error: null }).then(resolve)
	};
}

function makeSessionClient() {
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
		params: Promise.resolve({ groupSlug: TEST_GROUP_SLUG, date: TEST_DATE })
	});
}

describe('session detail page', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(() => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeSessionClient());
		mockResolveGroupIdBySlug.mockResolvedValue(Number(TEST_GROUP_ID));
	});

	describe('slug does not resolve', () => {
		it('calls notFound()', async () => {
			mockResolveGroupIdBySlug.mockResolvedValue(null);
			vi.mocked(notFound).mockImplementationOnce(() => {
				throw new Error('NEXT_NOT_FOUND');
			});
			await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
		});
	});

	it('renders date as heading', async () => {
		render(await renderPage());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toContain('15th March 2024');
	});

	it('excludes non-FULL_GROWN sessions from the main Sessions query', async () => {
		const client = makeSessionClient();
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
		render(await renderPage());
		await screen.findByTestId('session-stats');
		const mainSessionsChain = client.from.mock.results[0].value;
		expect(mainSessionsChain.eq).toHaveBeenCalledWith(
			'session_type',
			'FULL_GROWN'
		);
	});

	describe('adjacent session date lookups', () => {
		it('excludes non-FULL_GROWN sessions from the previous-session lookup', async () => {
			const client = makeSessionClient();
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
			render(await renderPage());
			await screen.findByTestId('session-stats');
			const previousChain = client.from.mock.results[1].value;
			expect(previousChain.eq).toHaveBeenCalledWith(
				'session_type',
				'FULL_GROWN'
			);
		});

		it('excludes non-FULL_GROWN sessions from the next-session lookup', async () => {
			const client = makeSessionClient();
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
			render(await renderPage());
			await screen.findByTestId('session-stats');
			const nextChain = client.from.mock.results[2].value;
			expect(nextChain.eq).toHaveBeenCalledWith('session_type', 'FULL_GROWN');
		});
	});

	describe('a date whose only Sessions row is PULLI or FIELD_OBSERVATION', () => {
		it('renders the "No session found" empty state instead of 404ing', async () => {
			const client = {
				from: vi
					.fn()
					.mockReturnValueOnce(makeChain([]))
					.mockReturnValueOnce(makeChain(mockPreviousSession))
					.mockReturnValueOnce(makeChain(mockNextSession))
			};
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
			render(await renderPage());
			await screen.findByText(/No session found/i);
		});
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

	it('renders session chronology stats', async () => {
		render(await renderPage());
		const stats = await screen.findByTestId('session-stats');
		expect(stats.textContent).toContain('Start: 08:00');
		expect(stats.textContent).toContain('End: 08:30');
		expect(stats.textContent).toContain('Duration: 30m');
		expect(stats.textContent).toContain('Net rounds: 3');
	});

	it('renders the oldest-bird pill with proven age, species and ring number', async () => {
		render(await renderPage());
		const stats = await screen.findByTestId('session-stats');
		expect(stats.textContent).toContain('Oldest: 5 years — Robin (ABC001)');
	});

	it('renders one table row per species', async () => {
		render(await renderPage());
		const table = await screen.findByTestId('session-table');
		const rows = table.querySelectorAll('tbody tr');
		expect(rows.length).toBe(2);
	});

	it('renders the highlights section on the date-level page', async () => {
		render(await renderPage());
		const highlights = await screen.findByTestId('session-highlights');
		expect(highlights.textContent).toContain('Highlights');
		expect(highlights.textContent).toContain('Busiest session ever — 3 birds');
	});

	describe('multi-location day', () => {
		it('renders a Locations badge link to the site-filtered session URL', async () => {
			const multiLocationSessions = [
				mockSessions[0],
				{
					id: 2,
					location_id: 11,
					location: {
						id: 11,
						location_name: 'Other Reserve',
						ringing_group_id: 1
					}
				}
			];
			const client = {
				from: vi
					.fn()
					.mockReturnValueOnce(makeChain(multiLocationSessions))
					.mockReturnValueOnce(makeChain(mockPreviousSession))
					.mockReturnValueOnce(makeChain(mockNextSession))
					.mockReturnValueOnce(makeChain(mockEncounters))
			};
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
			render(await renderPage());
			const locationLink = await screen.findByRole('link', {
				name: 'Other Reserve'
			});
			expect(locationLink.getAttribute('href')).toBe(
				`/group/${TEST_GROUP_SLUG}/session/${TEST_DATE}/site/11`
			);
		});
	});

	describe('session navigation', () => {
		it('renders a "Previous" link pointing to the previous session date', async () => {
			render(await renderPage());
			const previousLink = await screen.findByRole('link', {
				name: /previous session/i
			});
			expect(previousLink.getAttribute('href')).toBe(
				`/group/${TEST_GROUP_SLUG}/session/${mockPreviousSession[0].visit_date}`
			);
		});

		it('renders a "Next" link pointing to the next session date', async () => {
			render(await renderPage());
			const nextLink = await screen.findByRole('link', {
				name: /next session/i
			});
			expect(nextLink.getAttribute('href')).toBe(
				`/group/${TEST_GROUP_SLUG}/session/${mockNextSession[0].visit_date}`
			);
		});
	});
});
