import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { SessionHighlights } from '../SessionHighlights';
import type { SessionHighlight } from '@/app/lib/highlights';
import type { CombinedHighlight } from '@/app/lib/highlights/v2/types';
import type { SessionEncounter } from '@/app/models/session';

vi.mock('@/app/actions/session-highlights', () => ({
	fetchSessionHighlights: vi.fn()
}));

// Rarities (#990) and Counts (#989) both come from the v2 pipeline
// (getCondensedHighlightsAtTimePeriod), fetched in parallel with the v1 action —
// see SessionHighlights.tsx. Mock it as the one collaborator it is,
// independently of the v1 fetch.
vi.mock('@/app/lib/highlights/v2', () => ({
	getCondensedHighlightsAtTimePeriod: vi.fn()
}));

// v2 highlight fixtures — treat getCondensedHighlightsAtTimePeriod as a black
// box: each printer is a test double returning a fixed sentence, not the real v2
// formatting logic (that's covered by the v2 pipeline's own tests). The component
// tells the two sections apart by descriptor.category alone.
function makeV2Highlight(
	category: CombinedHighlight['descriptor']['category'],
	type: string,
	sentence: string
): CombinedHighlight {
	return {
		formatters: {
			combinedHighlightPrinter: () => sentence,
			highlightListPrefixPrinter: () => ''
		},
		descriptor: { category, type, unit: 'encounter' },
		value: { timePeriod: '2024-09-15', value: 74, species: null },
		species: undefined,
		bestPosition: 1,
		scopes: []
	};
}

const RARITY_HIGHLIGHT = makeV2Highlight(
	'rarity',
	'firstSpeciesRecord',
	'First Firecrest record ever'
);
const COUNT_HIGHLIGHT = makeV2Highlight(
	'count',
	'session-total',
	'Busiest session ever — 74 birds'
);
const VITAL_STAT_HIGHLIGHT: SessionHighlight = {
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
// long-absence-retrap matches no section — see
// docs/session-highlight-ordering.md — so it's used to assert it renders
// nowhere on the page.
const LONG_ABSENCE_HIGHLIGHT: SessionHighlight = {
	type: 'long-absence-retrap',
	ringNo: 'ARRETRAP',
	speciesName: 'Robin',
	previousDate: '2021-06-20',
	gapYears: 2,
	gapMonths: 10
};

// Vital stats is all that's left on the v1 side — Rarities and Counts are
// v2-only, see the fixtures above.
const ALL_SECTION_HIGHLIGHTS: SessionHighlight[] = [VITAL_STAT_HIGHLIGHT];

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
	} as SessionEncounter;
}

async function mockHighlights(highlights: SessionHighlight[]) {
	const { fetchSessionHighlights } =
		await import('@/app/actions/session-highlights');
	vi.mocked(fetchSessionHighlights).mockResolvedValue(highlights);
}

async function mockV2Highlights(highlights: CombinedHighlight[]) {
	const { getCondensedHighlightsAtTimePeriod } =
		await import('@/app/lib/highlights/v2');
	vi.mocked(getCondensedHighlightsAtTimePeriod).mockResolvedValue(highlights);
}

function renderSessionHighlights(
	overrides: Partial<{
		date: string;
		viewedGroupId: number;
		oldestEncounter: SessionEncounter | null;
	}> = {}
) {
	const props = {
		date: '2024-09-15',
		viewedGroupId: 1,
		oldestEncounter: null as SessionEncounter | null,
		...overrides
	};
	return render(
		<SessionHighlights
			date={props.date}
			viewedGroupId={props.viewedGroupId}
			oldestEncounter={props.oldestEncounter}
		/>
	);
}

describe('SessionHighlights', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	beforeEach(async () => {
		await mockHighlights(ALL_SECTION_HIGHLIGHTS);
		await mockV2Highlights([]);
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
		renderSessionHighlights();
		expect(document.querySelector('.loading')).not.toBeNull();
		resolveData(ALL_SECTION_HIGHLIGHTS);
	});

	it('renders a Rarities/Counts/Vital stats heading and item per section when all three groups have highlights', async () => {
		await mockV2Highlights([RARITY_HIGHLIGHT, COUNT_HIGHLIGHT]);
		renderSessionHighlights();
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Rarities' })).toBeDefined();
		});
		expect(screen.getByRole('heading', { name: 'Counts' })).toBeDefined();
		expect(screen.getByRole('heading', { name: 'Vital stats' })).toBeDefined();

		const rarityItems = screen.getByTestId('rarities').querySelectorAll('li');
		expect(rarityItems.length).toBe(1);
		expect(rarityItems[0].textContent).toBe('First Firecrest record ever');

		const countItems = screen.getByTestId('counts').querySelectorAll('li');
		expect(countItems.length).toBe(1);
		expect(countItems[0].textContent).toBe('Busiest session ever — 74 birds');

		const vitalStatItems = screen
			.getByTestId('vital-stats')
			.querySelectorAll('li');
		expect(vitalStatItems.length).toBe(1);
		expect(vitalStatItems[0].textContent).toBe(
			'Heaviest Blue Tit ever weighed — 13.1g'
		);
	});

	it('renders a "Best of the session" heading with the oldest-bird sentence when an oldest encounter is provided', async () => {
		renderSessionHighlights({ oldestEncounter: makeOldestEncounter(5) });
		await waitFor(() => {
			expect(
				screen.getByRole('heading', { name: 'Best of the session' })
			).toBeDefined();
		});
		const items = screen.getByTestId('best-of-session').querySelectorAll('li');
		expect(items.length).toBe(1);
		expect(items[0].textContent).toBe('Oldest: 5 years — Robin (ABC001)');
	});

	it('renders every section together when highlights and an oldest encounter are both present', async () => {
		await mockV2Highlights([RARITY_HIGHLIGHT, COUNT_HIGHLIGHT]);
		renderSessionHighlights({ oldestEncounter: makeOldestEncounter(5) });
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Rarities' })).toBeDefined();
		});
		expect(screen.getByRole('heading', { name: 'Counts' })).toBeDefined();
		expect(screen.getByRole('heading', { name: 'Vital stats' })).toBeDefined();
		expect(
			screen.getByRole('heading', { name: 'Best of the session' })
		).toBeDefined();
		expect(
			screen.getByTestId('best-of-session').querySelectorAll('li').length
		).toBe(1);
	});

	describe('per-section show/hide', () => {
		it('shows only the Rarities section when only a rarity highlight is present', async () => {
			await mockHighlights([]);
			await mockV2Highlights([RARITY_HIGHLIGHT]);
			renderSessionHighlights();
			await waitFor(() => {
				expect(screen.getByRole('heading', { name: 'Rarities' })).toBeDefined();
			});
			expect(screen.queryByRole('heading', { name: 'Counts' })).toBeNull();
			expect(screen.queryByTestId('counts')).toBeNull();
			expect(screen.queryByRole('heading', { name: 'Vital stats' })).toBeNull();
			expect(screen.queryByTestId('vital-stats')).toBeNull();
		});

		it('shows only the Counts section when only a count highlight is present', async () => {
			await mockHighlights([]);
			await mockV2Highlights([COUNT_HIGHLIGHT]);
			renderSessionHighlights();
			await waitFor(() => {
				expect(screen.getByRole('heading', { name: 'Counts' })).toBeDefined();
			});
			expect(screen.queryByRole('heading', { name: 'Rarities' })).toBeNull();
			expect(screen.queryByTestId('rarities')).toBeNull();
			expect(screen.queryByRole('heading', { name: 'Vital stats' })).toBeNull();
			expect(screen.queryByTestId('vital-stats')).toBeNull();
		});

		it('shows only the Vital stats section when only a vital-stat highlight is present', async () => {
			await mockHighlights([VITAL_STAT_HIGHLIGHT]);
			renderSessionHighlights();
			await waitFor(() => {
				expect(
					screen.getByRole('heading', { name: 'Vital stats' })
				).toBeDefined();
			});
			expect(screen.queryByRole('heading', { name: 'Rarities' })).toBeNull();
			expect(screen.queryByTestId('rarities')).toBeNull();
			expect(screen.queryByRole('heading', { name: 'Counts' })).toBeNull();
			expect(screen.queryByTestId('counts')).toBeNull();
		});
	});

	it('renders nothing for a long-absence-retrap highlight — it matches no section', async () => {
		await mockHighlights([LONG_ABSENCE_HIGHLIGHT]);
		const { container } = renderSessionHighlights();
		await waitFor(() => {
			expect(document.querySelector('.loading')).toBeNull();
		});
		expect(container.innerHTML).toBe('');
	});

	it('renders only the Best-of-the-session subsection when there are no highlights but an oldest encounter is provided', async () => {
		await mockHighlights([]);
		renderSessionHighlights({ oldestEncounter: makeOldestEncounter(5) });
		await waitFor(() => {
			expect(
				screen.getByRole('heading', { name: 'Best of the session' })
			).toBeDefined();
		});
		expect(screen.queryByRole('heading', { name: 'Rarities' })).toBeNull();
		expect(screen.queryByRole('heading', { name: 'Counts' })).toBeNull();
		expect(screen.queryByRole('heading', { name: 'Vital stats' })).toBeNull();
	});

	it('renders the oldest-bird sentence in the existing "Oldest: N years — Species (RING)" format', async () => {
		await mockHighlights([]);
		renderSessionHighlights({ oldestEncounter: makeOldestEncounter(5) });
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
		await mockHighlights([]);
		const { container } = renderSessionHighlights();
		await waitFor(() => {
			expect(document.querySelector('.loading')).toBeNull();
		});
		expect(container.innerHTML).toBe('');
	});

	it('renders nothing for an oldest encounter with proven_age 0', async () => {
		await mockHighlights([]);
		const { container } = renderSessionHighlights({
			oldestEncounter: makeOldestEncounter(0)
		});
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
		const { container } = renderSessionHighlights({
			oldestEncounter: makeOldestEncounter(5)
		});
		await waitFor(() => {
			expect(document.querySelector('.loading')).toBeNull();
		});
		expect(container.innerHTML).toBe('');
		expect(screen.queryByTestId('rarities')).toBeNull();
		expect(consoleErrorSpy).toHaveBeenCalled();
	});
});
