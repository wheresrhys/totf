import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { SessionHighlights } from '../SessionHighlights';
import type { SessionHighlight } from '@/app/models/highlights';
import type { SessionEncounter } from '@/app/models/session';

vi.mock('@/app/actions/session-highlights', () => ({
	fetchSessionHighlights: vi.fn()
}));

// These mocks stand in for each group's already-ordered output; the component
// renders them in the given order.
const periodFields = {
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

// The "Best of the session" subsection only reads bird.proven_age,
// bird.species.species_name and bird.ring_no off the oldest encounter — the
// rest of the SessionEncounter shape is irrelevant here, so build a minimal one.
function makeOldestEncounter(provenAge: number): SessionEncounter {
	return {
		bird: {
			ring_no: 'ABC001',
			proven_age: provenAge,
			species: { species_name: 'Robin' }
		}
	} as unknown as SessionEncounter;
}

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
		render(
			<SessionHighlights
				date="2024-09-15"
				viewedGroupId={1}
				oldestEncounter={null}
			/>
		);
		expect(document.querySelector('.loading')).not.toBeNull();
		resolveData(mockHighlights);
	});

	it('renders a Standouts heading and one item per highlight', async () => {
		render(
			<SessionHighlights
				date="2024-09-15"
				viewedGroupId={1}
				oldestEncounter={null}
			/>
		);
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Standouts' })).toBeDefined();
		});
		const items = screen.getByTestId('standouts').querySelectorAll('li');
		expect(items.length).toBe(2);
		expect(items[0].textContent).toBe('Busiest session ever — 74 birds');
		expect(items[1].textContent).toBe(
			'Most varied session this year — 18 species'
		);
	});

	it('renders a "Best of the session" heading with the oldest-bird sentence when an oldest encounter is provided', async () => {
		render(
			<SessionHighlights
				date="2024-09-15"
				viewedGroupId={1}
				oldestEncounter={makeOldestEncounter(5)}
			/>
		);
		await waitFor(() => {
			expect(
				screen.getByRole('heading', { name: 'Best of the session' })
			).toBeDefined();
		});
		const items = screen.getByTestId('best-of-session').querySelectorAll('li');
		expect(items.length).toBe(1);
		expect(items[0].textContent).toBe('Oldest: 5 years — Robin (ABC001)');
	});

	it('renders both subsections together when both highlights and an oldest encounter are present', async () => {
		render(
			<SessionHighlights
				date="2024-09-15"
				viewedGroupId={1}
				oldestEncounter={makeOldestEncounter(5)}
			/>
		);
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Standouts' })).toBeDefined();
		});
		expect(
			screen.getByRole('heading', { name: 'Best of the session' })
		).toBeDefined();
		expect(screen.getByTestId('standouts').querySelectorAll('li').length).toBe(
			2
		);
		expect(
			screen.getByTestId('best-of-session').querySelectorAll('li').length
		).toBe(1);
	});

	it('renders only the Best-of-the-session subsection when there are no highlights but an oldest encounter is provided', async () => {
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue([]);
		render(
			<SessionHighlights
				date="2024-09-15"
				viewedGroupId={1}
				oldestEncounter={makeOldestEncounter(5)}
			/>
		);
		await waitFor(() => {
			expect(
				screen.getByRole('heading', { name: 'Best of the session' })
			).toBeDefined();
		});
		expect(screen.queryByRole('heading', { name: 'Standouts' })).toBeNull();
		expect(screen.queryByTestId('standouts')).toBeNull();
	});

	it('renders only the Standouts subsection when there is no oldest encounter but highlights exist', async () => {
		render(
			<SessionHighlights
				date="2024-09-15"
				viewedGroupId={1}
				oldestEncounter={null}
			/>
		);
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Standouts' })).toBeDefined();
		});
		expect(
			screen.queryByRole('heading', { name: 'Best of the session' })
		).toBeNull();
		expect(screen.queryByTestId('best-of-session')).toBeNull();
	});

	it('renders the oldest-bird sentence in the existing "Oldest: N years — Species (RING)" format', async () => {
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue([]);
		render(
			<SessionHighlights
				date="2024-09-15"
				viewedGroupId={1}
				oldestEncounter={makeOldestEncounter(5)}
			/>
		);
		await waitFor(() => {
			expect(
				screen.getByRole('heading', { name: 'Best of the session' })
			).toBeDefined();
		});
		expect(screen.getByTestId('best-of-session').textContent).toBe(
			'Oldest: 5 years — Robin (ABC001)'
		);
	});

	it('renders nothing when there are no highlights and no oldest encounter', async () => {
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue([]);
		const { container } = render(
			<SessionHighlights
				date="2024-09-15"
				viewedGroupId={1}
				oldestEncounter={null}
			/>
		);
		await waitFor(() => {
			expect(document.querySelector('.loading')).toBeNull();
		});
		expect(container.innerHTML).toBe('');
	});

	it('renders nothing for an oldest encounter with proven_age 0', async () => {
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue([]);
		const { container } = render(
			<SessionHighlights
				date="2024-09-15"
				viewedGroupId={1}
				oldestEncounter={makeOldestEncounter(0)}
			/>
		);
		await waitFor(() => {
			expect(document.querySelector('.loading')).toBeNull();
		});
		expect(container.innerHTML).toBe('');
	});

	it('renders nothing when the action rejects, even with an oldest encounter provided', async () => {
		const consoleErrorSpy = vi
			.spyOn(console, 'error')
			.mockImplementation(() => {});
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockRejectedValue(
			new Error('action failed')
		);
		const { container } = render(
			<SessionHighlights
				date="2024-09-15"
				viewedGroupId={1}
				oldestEncounter={makeOldestEncounter(5)}
			/>
		);
		await waitFor(() => {
			expect(document.querySelector('.loading')).toBeNull();
		});
		expect(container.innerHTML).toBe('');
		expect(screen.queryByTestId('standouts')).toBeNull();
		expect(consoleErrorSpy).toHaveBeenCalled();
	});

	it('renders species record sentences alongside session-total records', async () => {
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue(
			mockHighlightsWithSpeciesRecord
		);
		render(
			<SessionHighlights
				date="2024-09-15"
				viewedGroupId={1}
				oldestEncounter={null}
			/>
		);
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Standouts' })).toBeDefined();
		});
		const items = screen.getByTestId('standouts').querySelectorAll('li');
		expect(items.length).toBe(2);
		expect(items[0].textContent).toBe('Busiest session ever — 74 birds');
		expect(items[1].textContent).toBe(
			'Record day for Reed Warbler — 12 caught, the most ever'
		);
	});

	it('renders first-ever sentences', async () => {
		const firstEverHighlight: SessionHighlight = {
			type: 'first-ever-species',
			speciesName: 'Firecrest',
			multipleIndividualsRecorded: false,
			isOnlyRecord: false
		};
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue([firstEverHighlight]);
		render(
			<SessionHighlights
				date="2024-09-15"
				viewedGroupId={1}
				oldestEncounter={null}
			/>
		);
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Standouts' })).toBeDefined();
		});
		const items = screen.getByTestId('standouts').querySelectorAll('li');
		expect(items.length).toBe(1);
		expect(items[0].textContent).toBe('First ever Firecrest record');
	});

	it('renders rare-species sentences', async () => {
		const rareSpeciesHighlight: SessionHighlight = {
			type: 'rare-species',
			speciesName: 'Firecrest',
			totalSessionDays: 2
		};
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue([rareSpeciesHighlight]);
		render(
			<SessionHighlights
				date="2024-09-15"
				viewedGroupId={1}
				oldestEncounter={null}
			/>
		);
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Standouts' })).toBeDefined();
		});
		const items = screen.getByTestId('standouts').querySelectorAll('li');
		expect(items.length).toBe(1);
		expect(items[0].textContent).toBe(
			'MEGA — Firecrest seen on only 2 days ever'
		);
	});

	it('renders a MEGA line for an only-of-year record folded with rarity', async () => {
		const items = await renderSingleHighlight({
			type: 'mega-species',
			base: {
				type: 'first-of-year-species',
				speciesName: 'Meadow Pipit',
				year: 2023,
				isCurrentYear: false,
				multipleIndividualsRecorded: true,
				isOnlyRecord: true
			},
			totalSessionDays: 3
		});
		expect(items[0].textContent).toBe(
			'MEGA — Only Meadow Pipit records of 2023 (only 3 records ever)'
		);
	});

	it('renders a MEGA line for a first-of-year record folded with rarity', async () => {
		const items = await renderSingleHighlight({
			type: 'mega-species',
			base: {
				type: 'first-of-year-species',
				speciesName: 'Meadow Pipit',
				year: 2023,
				isCurrentYear: false,
				multipleIndividualsRecorded: true,
				isOnlyRecord: false
			},
			totalSessionDays: 3
		});
		expect(items[0].textContent).toBe(
			'MEGA — First Meadow Pipit records of 2023 (only 3 records ever)'
		);
	});

	it('renders a MEGA line for an only-ever record without a rarity note', async () => {
		const items = await renderSingleHighlight({
			type: 'mega-species',
			base: {
				type: 'first-ever-species',
				speciesName: 'Meadow Pipit',
				multipleIndividualsRecorded: false,
				isOnlyRecord: true
			},
			totalSessionDays: 1
		});
		expect(items[0].textContent).toBe('MEGA — Only Meadow Pipit record ever');
	});

	it('renders a MEGA line for a first-ever record, counting the other occasions', async () => {
		const items = await renderSingleHighlight({
			type: 'mega-species',
			base: {
				type: 'first-ever-species',
				speciesName: 'Meadow Pipit',
				multipleIndividualsRecorded: false,
				isOnlyRecord: false
			},
			totalSessionDays: 3
		});
		expect(items[0].textContent).toBe(
			'MEGA — First Meadow Pipit ever (only recorded on 2 other occasions)'
		);
	});

	it('renders long-absence sentences', async () => {
		const longAbsenceHighlight: SessionHighlight = {
			type: 'long-absence-retrap',
			ringNo: 'ARRETRAP',
			speciesName: 'Robin',
			previousDate: '2021-06-20',
			gapYears: 2,
			gapMonths: 10
		};
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue([longAbsenceHighlight]);
		render(
			<SessionHighlights
				date="2024-09-15"
				viewedGroupId={1}
				oldestEncounter={null}
			/>
		);
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Standouts' })).toBeDefined();
		});
		const items = screen.getByTestId('standouts').querySelectorAll('li');
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
				kind: 'quietest',
				value: 3,
				sinceDate: '2023-09-14'
			},
			{
				type: 'first-ever-species',
				speciesName: 'Firecrest',
				multipleIndividualsRecorded: false,
				isOnlyRecord: false
			},
			{
				type: 'long-absence-retrap',
				ringNo: 'ARRETRAP',
				speciesName: 'Robin',
				previousDate: '2021-06-20',
				gapYears: 2,
				gapMonths: 10
			},
			{
				type: 'weight-record',
				speciesName: 'Blue Tit',
				scope: 'all-time',
				extreme: 'heaviest',
				weight: 13.1,
				placementRank: 1,
				isJointPlacement: false,
				year: 2024,
				isCurrentYear: false
			}
		];
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue(mixedHighlights);
		render(
			<SessionHighlights
				date="2024-09-15"
				viewedGroupId={1}
				oldestEncounter={null}
			/>
		);
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Standouts' })).toBeDefined();
		});
		const items = screen.getByTestId('standouts').querySelectorAll('li');
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

	async function renderSingleHighlight(highlight: SessionHighlight) {
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue([highlight]);
		render(
			<SessionHighlights
				date="2024-09-15"
				viewedGroupId={1}
				oldestEncounter={null}
			/>
		);
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Standouts' })).toBeDefined();
		});
		return screen.getByTestId('standouts').querySelectorAll('li');
	}

	function placementHighlight(
		placementRank: 2 | 3,
		species: { name: string; isJoint: boolean }[]
	): SessionHighlight {
		return {
			type: 'combined-species-placement-record',
			placementRank,
			species
		};
	}

	it('renders a combined strict 2nd-best placement without a count', async () => {
		const items = await renderSingleHighlight(
			placementHighlight(2, [
				{ name: 'Dunnock', isJoint: false },
				{ name: 'Whitethroat', isJoint: false }
			])
		);
		expect(items[0].textContent).toBe(
			'Second best day for Dunnock and Whitethroat ever'
		);
	});

	it('renders a combined all-joint 2nd-best placement without a count', async () => {
		const items = await renderSingleHighlight(
			placementHighlight(2, [
				{ name: 'Dunnock', isJoint: true },
				{ name: 'Whitethroat', isJoint: true }
			])
		);
		expect(items[0].textContent).toBe(
			'Joint second best day for Dunnock and Whitethroat ever'
		);
	});

	it('renders a mixed 2nd-best placement, flagging the joint species inline', async () => {
		const items = await renderSingleHighlight(
			placementHighlight(2, [
				{ name: 'Dunnock', isJoint: false },
				{ name: 'Whitethroat', isJoint: true }
			])
		);
		expect(items[0].textContent).toBe(
			'Second best day for Dunnock and (tied second) Whitethroat ever'
		);
	});

	it('comma-joins three merged species and phrases the third-best rank', async () => {
		const items = await renderSingleHighlight(
			placementHighlight(3, [
				{ name: 'Dunnock', isJoint: false },
				{ name: 'Whitethroat', isJoint: false },
				{ name: 'Wren', isJoint: false }
			])
		);
		expect(items[0].textContent).toBe(
			'Third best day for Dunnock, Whitethroat and Wren ever'
		);
	});

	it('renders weight record sentences', async () => {
		const weightHighlight: SessionHighlight = {
			type: 'weight-record',
			speciesName: 'Blue Tit',
			scope: 'all-time',
			extreme: 'heaviest',
			weight: 13.1,
			placementRank: 1,
			isJointPlacement: false,
			year: 2024,
			isCurrentYear: false
		};
		const { fetchSessionHighlights } =
			await import('@/app/actions/session-highlights');
		vi.mocked(fetchSessionHighlights).mockResolvedValue([weightHighlight]);
		render(
			<SessionHighlights
				date="2024-09-15"
				viewedGroupId={1}
				oldestEncounter={null}
			/>
		);
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Standouts' })).toBeDefined();
		});
		const items = screen.getByTestId('standouts').querySelectorAll('li');
		expect(items.length).toBe(1);
		expect(items[0].textContent).toBe('Heaviest Blue Tit ever weighed — 13.1g');
	});
});
