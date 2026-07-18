import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { SessionHighlights } from '../SessionHighlights';
import {
	familySortValue,
	type SessionHighlight
} from '@/app/models/session-highlights';

vi.mock('@/app/actions/session-highlights', () => ({
	fetchSessionHighlights: vi.fn()
}));

// These mocks stand in for the machine's already-ordered output; the component
// renders them in the given order, so the exact sortValue is immaterial here.
const periodFields = {
	sortValue: familySortValue('scoped-record'),
	year: 2024,
	isCurrentYear: false
} as const;

// The action returns plain highlight data; the component renders each element
const mockHighlights: SessionHighlight[] = [
	{
		type: 'session-total-record',
		metric: 'encounters',
		scope: 'all-time',
		value: 74,
		...periodFields
	},
	{
		type: 'session-total-record',
		metric: 'species',
		scope: 'this-year',
		value: 18,
		...periodFields,
		isCurrentYear: true
	}
];

const mockHighlightsWithSpeciesRecord: SessionHighlight[] = [
	{
		type: 'session-total-record',
		metric: 'encounters',
		scope: 'all-time',
		value: 74,
		...periodFields
	},
	{
		type: 'species-count-record',
		speciesName: 'Reed Warbler',
		scope: 'all-time',
		value: 12,
		...periodFields
	}
];

describe('SessionHighlights', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	beforeEach(async () => {
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue(mockHighlights);
	});

	it('renders a loading spinner before data loads', async () => {
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		let resolveData!: (v: SessionHighlight[]) => void;
		vi.mocked(fetchSessionHighlights).mockReturnValue(
			new Promise((resolve) => {
				resolveData = resolve;
			})
		);
		render(<SessionHighlights date="2024-09-15" viewedGroupId={1} />);
		expect(document.querySelector('.loading')).not.toBeNull();
		resolveData(mockHighlights);
	});

	it('renders a Highlights heading and one item per highlight', async () => {
		render(<SessionHighlights date="2024-09-15" viewedGroupId={1} />);
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Highlights' })).toBeDefined();
		});
		const items = screen
			.getByTestId('session-highlights')
			.querySelectorAll('li');
		expect(items.length).toBe(2);
		expect(items[0].textContent).toBe('Busiest session ever — 74 birds');
		expect(items[1].textContent).toBe(
			'Most varied session this year — 18 species'
		);
	});

	it('renders nothing when there are no highlights', async () => {
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue([]);
		const { container } = render(
			<SessionHighlights date="2024-09-15" viewedGroupId={1} />
		);
		await waitFor(() => {
			expect(document.querySelector('.loading')).toBeNull();
		});
		expect(container.innerHTML).toBe('');
	});

	it('renders nothing when the action rejects', async () => {
		const consoleErrorSpy = vi
			.spyOn(console, 'error')
			.mockImplementation(() => {});
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockRejectedValue(
			new Error('action failed')
		);
		const { container } = render(
			<SessionHighlights date="2024-09-15" viewedGroupId={1} />
		);
		await waitFor(() => {
			expect(document.querySelector('.loading')).toBeNull();
		});
		expect(container.innerHTML).toBe('');
		expect(consoleErrorSpy).toHaveBeenCalled();
	});

	it('renders species record sentences alongside session-total records', async () => {
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue(
			mockHighlightsWithSpeciesRecord
		);
		render(<SessionHighlights date="2024-09-15" viewedGroupId={1} />);
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Highlights' })).toBeDefined();
		});
		const items = screen
			.getByTestId('session-highlights')
			.querySelectorAll('li');
		expect(items.length).toBe(2);
		expect(items[0].textContent).toBe('Busiest session ever — 74 birds');
		expect(items[1].textContent).toBe(
			'Record day for Reed Warbler — 12 caught, the most ever'
		);
	});

	it('renders first-ever sentences', async () => {
		const firstEverHighlight: SessionHighlight = {
			type: 'first-ever-species',
			sortValue: familySortValue('scoped-record'),
			speciesName: 'Firecrest',
			multipleIndividualsRecorded: false,
			isOnlyRecord: false
		};
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue([firstEverHighlight]);
		render(<SessionHighlights date="2024-09-15" viewedGroupId={1} />);
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Highlights' })).toBeDefined();
		});
		const items = screen
			.getByTestId('session-highlights')
			.querySelectorAll('li');
		expect(items.length).toBe(1);
		expect(items[0].textContent).toBe('First ever Firecrest record');
	});

	it('renders rare-species sentences', async () => {
		const rareSpeciesHighlight: SessionHighlight = {
			type: 'rare-species',
			sortValue: familySortValue('scoped-record'),
			speciesName: 'Firecrest',
			totalSessionDays: 2
		};
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue([rareSpeciesHighlight]);
		render(<SessionHighlights date="2024-09-15" viewedGroupId={1} />);
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Highlights' })).toBeDefined();
		});
		const items = screen
			.getByTestId('session-highlights')
			.querySelectorAll('li');
		expect(items.length).toBe(1);
		expect(items[0].textContent).toBe(
			'Rarely recorded — Firecrest seen on only 2 days ever'
		);
	});

	it('renders long-absence sentences', async () => {
		const longAbsenceHighlight: SessionHighlight = {
			type: 'long-absence-retrap',
			sortValue: familySortValue('scoped-record'),
			ringNo: 'ARRETRAP',
			speciesName: 'Robin',
			previousDate: '2021-06-20',
			gapYears: 2,
			gapMonths: 10
		};
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue([longAbsenceHighlight]);
		render(<SessionHighlights date="2024-09-15" viewedGroupId={1} />);
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Highlights' })).toBeDefined();
		});
		const items = screen
			.getByTestId('session-highlights')
			.querySelectorAll('li');
		expect(items.length).toBe(1);
		expect(items[0].textContent).toBe(
			'Robin ARRETRAP recaught after 2 years, 10 months away (last seen 20 Jun 2021)'
		);
	});

	it('renders a full mixed set of highlights in priority order', async () => {
		// One highlight from every family in priority order (the action runs the
		// highlight machine before returning); the component renders each.
		const mixedHighlights: SessionHighlight[] = [
			{
				type: 'session-total-record',
				metric: 'encounters',
				scope: 'all-time',
				value: 74,
				...periodFields
			},
			{
				type: 'species-count-record',
				speciesName: 'Reed Warbler',
				scope: 'all-time',
				value: 12,
				...periodFields
			},
			{
				type: 'since-comparison',
				sortValue: familySortValue('scoped-record'),
				kind: 'quietest',
				value: 3,
				sinceDate: '2023-09-14'
			},
			{
				type: 'first-ever-species',
				sortValue: familySortValue('scoped-record'),
				speciesName: 'Firecrest',
				multipleIndividualsRecorded: false,
				isOnlyRecord: false
			},
			{
				type: 'long-absence-retrap',
				sortValue: familySortValue('scoped-record'),
				ringNo: 'ARRETRAP',
				speciesName: 'Robin',
				previousDate: '2021-06-20',
				gapYears: 2,
				gapMonths: 10
			},
			{
				type: 'weight-record',
				sortValue: familySortValue('scoped-record'),
				speciesName: 'Blue Tit',
				extreme: 'heaviest',
				weight: 13.1,
				placementRank: 1,
				isJointPlacement: false
			}
		];
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue(mixedHighlights);
		render(<SessionHighlights date="2024-09-15" viewedGroupId={1} />);
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Highlights' })).toBeDefined();
		});
		const items = screen
			.getByTestId('session-highlights')
			.querySelectorAll('li');
		// The machine sorts the scoped record block first (busiest all-time,
		// then Reed Warbler all-time), then the quietest-since comparison, then
		// the first/absence block, with weights last.
		expect([...items].map((item) => item.textContent)).toEqual([
			'Busiest session ever — 74 birds',
			'Record day for Reed Warbler — 12 caught, the most ever',
			'Quietest session since 14 Sep 2023 — 3 birds',
			'First ever Firecrest record',
			'Robin ARRETRAP recaught after 2 years, 10 months away (last seen 20 Jun 2021)',
			'Heaviest Blue Tit ever weighed — 13.1g'
		]);
	});

	it('renders weight record sentences', async () => {
		const weightHighlight: SessionHighlight = {
			type: 'weight-record',
			sortValue: familySortValue('scoped-record'),
			speciesName: 'Blue Tit',
			extreme: 'heaviest',
			weight: 13.1,
			placementRank: 1,
			isJointPlacement: false
		};
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue([weightHighlight]);
		render(<SessionHighlights date="2024-09-15" viewedGroupId={1} />);
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Highlights' })).toBeDefined();
		});
		const items = screen
			.getByTestId('session-highlights')
			.querySelectorAll('li');
		expect(items.length).toBe(1);
		expect(items[0].textContent).toBe('Heaviest Blue Tit ever weighed — 13.1g');
	});
});
