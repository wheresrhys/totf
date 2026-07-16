import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { SessionHighlights } from '../SessionHighlights';
import {
	FirstEverSpeciesHighlight,
	LongAbsenceRetrapHighlight,
	RareSpeciesHighlight,
	SessionTotalRecordHighlight,
	SinceComparisonHighlight,
	SpeciesCountRecordHighlight,
	WeightRecordHighlight
} from '@/app/models/session-highlights';

vi.mock('@/app/actions/session-highlights', () => ({
	fetchSessionHighlights: vi.fn()
}));

const periodFields = {
	seasonName: 'autumn',
	year: 2024,
	isCurrentYear: false,
	isCurrentSeason: false,
	seasonPeriodLabel: 'autumn 2024'
} as const;

// The action returns highlights already rendered (keyed <li> elements)
const mockHighlights: ReactElement[] = [
	new SessionTotalRecordHighlight({
		metric: 'encounters',
		scope: 'all-time',
		value: 74,
		...periodFields
	}).render(),
	new SessionTotalRecordHighlight({
		metric: 'species',
		scope: 'this-season',
		value: 18,
		...periodFields,
		isCurrentYear: true,
		isCurrentSeason: true
	}).render()
];

const mockHighlightsWithSpeciesRecord: ReactElement[] = [
	new SessionTotalRecordHighlight({
		metric: 'encounters',
		scope: 'all-time',
		value: 74,
		...periodFields
	}).render(),
	new SpeciesCountRecordHighlight({
		speciesName: 'Reed Warbler',
		scope: 'all-time',
		value: 12,
		...periodFields
	}).render()
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
		let resolveData!: (v: ReactElement[]) => void;
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
			'Most varied session this autumn — 18 species'
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
		const firstEverHighlight = new FirstEverSpeciesHighlight({
			speciesName: 'Firecrest',
			multipleIndividualsRecorded: false,
			isOnlyRecord: false
		});
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue([
			firstEverHighlight.render()
		]);
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
		const rareSpeciesHighlight = new RareSpeciesHighlight({
			speciesName: 'Firecrest',
			totalSessionDays: 2
		});
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue([
			rareSpeciesHighlight.render()
		]);
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
		const longAbsenceHighlight = new LongAbsenceRetrapHighlight({
			ringNo: 'ARRETRAP',
			speciesName: 'Robin',
			previousDate: '2021-06-20',
			gapYears: 2,
			gapMonths: 10
		});
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue([
			longAbsenceHighlight.render()
		]);
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
		// One highlight from every family, already rendered in priority order
		// (the action runs the highlight machine and renders before returning);
		// the component renders the elements as given
		const mixedHighlights: ReactElement[] = [
			new SessionTotalRecordHighlight({
				metric: 'encounters',
				scope: 'all-time',
				value: 74,
				...periodFields
			}).render(),
			new SinceComparisonHighlight({
				kind: 'quietest',
				value: 3,
				sinceDate: '2023-09-14'
			}).render(),
			new SpeciesCountRecordHighlight({
				speciesName: 'Reed Warbler',
				scope: 'all-time',
				value: 12,
				...periodFields
			}).render(),
			new FirstEverSpeciesHighlight({
				speciesName: 'Firecrest',
				multipleIndividualsRecorded: false,
				isOnlyRecord: false
			}).render(),
			new LongAbsenceRetrapHighlight({
				ringNo: 'ARRETRAP',
				speciesName: 'Robin',
				previousDate: '2021-06-20',
				gapYears: 2,
				gapMonths: 10
			}).render(),
			new WeightRecordHighlight({
				speciesName: 'Blue Tit',
				extreme: 'heaviest',
				weight: 13.1,
				placementRank: 1,
				isJointPlacement: false
			}).render()
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
		expect([...items].map((item) => item.textContent)).toEqual([
			'Busiest session ever — 74 birds',
			'Quietest session since 14 Sep 2023 — 3 birds',
			'Record day for Reed Warbler — 12 caught, the most ever',
			'First ever Firecrest record',
			'Robin ARRETRAP recaught after 2 years, 10 months away (last seen 20 Jun 2021)',
			'Heaviest Blue Tit ever weighed — 13.1g'
		]);
	});

	it('renders weight record sentences', async () => {
		const weightHighlight = new WeightRecordHighlight({
			speciesName: 'Blue Tit',
			extreme: 'heaviest',
			weight: 13.1,
			placementRank: 1,
			isJointPlacement: false
		});
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue([
			weightHighlight.render()
		]);
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
