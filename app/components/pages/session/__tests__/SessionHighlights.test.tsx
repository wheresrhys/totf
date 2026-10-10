import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SessionHighlights } from '../SessionHighlights';
import {
	fetchSessionHighlights,
	type SessionTabParams
} from '../session-tab-config';
import type {
	CombinedHighlight,
	HighlightCategory
} from '@/app/lib/highlights/types';
import type { SessionEncounter } from '@/app/models/session';

// Rarities (#990), Counts (#989) and Vital stats all come from the v2
// highlights pipeline's getAllHighlightsAcrossScopes — see
// session-tab-config.ts. Mock it as the one collaborator it is.
vi.mock('@/app/lib/highlights/lib/hg2', () => ({
	getAllHighlightsAcrossScopes: vi.fn()
}));

// A v2 highlight carries its own printer, so the sentence a section renders is
// whatever that printer returns — a test double here returning a fixed
// sentence, not the real v2 formatting logic (covered by the v2 pipeline's own
// tests).
function makeHighlight(
	category: HighlightCategory,
	sentence: string
): CombinedHighlight {
	return {
		formatters: {
			combinedHighlightPrinter: () => sentence,
			highlightListPrefixPrinter: () => ''
		},
		descriptor: { category, type: `${category}-type`, unit: 'encounter' },
		value: { timePeriod: '2024-09-15', value: 74, species: null },
		species: 'Robin',
		bestPosition: 1,
		scopes: []
	} as CombinedHighlight;
}

const RARITY_HIGHLIGHT = makeHighlight('rarity', 'First Firecrest ever');
const COUNT_HIGHLIGHT = makeHighlight(
	'count',
	'Busiest session ever — 74 birds'
);
const VITAL_STAT_HIGHLIGHT = makeHighlight(
	'biometrics',
	'Heaviest Robin ever — 12g'
);

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

function renderSessionHighlights({
	highlights = [] as CombinedHighlight[] | null,
	oldestEncounter = null as SessionEncounter | null
} = {}) {
	const params = {
		date: '2024-09-15',
		mistNetSpeciesList: [],
		otherCatchesSpeciesList: [],
		netRounds: [],
		oldestEncounter
	} satisfies SessionTabParams;
	return render(<SessionHighlights params={params} data={highlights} />);
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('fetchSessionHighlights', () => {
	async function mockPipeline(highlights: CombinedHighlight[]) {
		const { getAllHighlightsAcrossScopes } =
			await import('@/app/lib/highlights/lib/hg2');
		vi.mocked(getAllHighlightsAcrossScopes).mockResolvedValue(highlights);
		return getAllHighlightsAcrossScopes;
	}

	it("asks the pipeline for the viewed group's highlights at the day scope, and hands them straight back", async () => {
		const pipelineHighlights = [COUNT_HIGHLIGHT];
		const pipeline = await mockPipeline(pipelineHighlights);
		const viewedGroup = { id: 7, slug: 'alpha' };

		const highlights = await fetchSessionHighlights(
			{ date: '2024-09-15' },
			viewedGroup
		);

		expect(pipeline).toHaveBeenCalledWith({
			timePeriod: '2024-09-15',
			temporalUnit: 'day',
			viewedGroup
		});
		expect(highlights).toBe(pipelineHighlights);
	});
});

describe('SessionHighlights', () => {
	it('renders a Rarities/Counts/Vital stats heading and item per section when all three categories have highlights', () => {
		renderSessionHighlights({
			highlights: [RARITY_HIGHLIGHT, COUNT_HIGHLIGHT, VITAL_STAT_HIGHLIGHT]
		});
		expect(screen.getByRole('heading', { name: 'Rarities' })).toBeDefined();
		expect(screen.getByRole('heading', { name: 'Counts' })).toBeDefined();
		expect(screen.getByRole('heading', { name: 'Vital stats' })).toBeDefined();

		const rarityItems = screen.getByTestId('rarities').querySelectorAll('li');
		expect(rarityItems.length).toBe(1);
		expect(rarityItems[0].textContent).toBe('First Firecrest ever');

		const countItems = screen.getByTestId('counts').querySelectorAll('li');
		expect(countItems.length).toBe(1);
		expect(countItems[0].textContent).toBe('Busiest session ever — 74 birds');

		const vitalStatItems = screen
			.getByTestId('vital-stats')
			.querySelectorAll('li');
		expect(vitalStatItems.length).toBe(1);
		expect(vitalStatItems[0].textContent).toBe('Heaviest Robin ever — 12g');
	});

	it('renders every section together when highlights and an oldest encounter are both present', () => {
		renderSessionHighlights({
			highlights: [RARITY_HIGHLIGHT, COUNT_HIGHLIGHT, VITAL_STAT_HIGHLIGHT],
			oldestEncounter: makeOldestEncounter(5)
		});
		expect(screen.getByRole('heading', { name: 'Rarities' })).toBeDefined();
		expect(screen.getByRole('heading', { name: 'Counts' })).toBeDefined();
		expect(screen.getByRole('heading', { name: 'Vital stats' })).toBeDefined();
		expect(
			screen.getByRole('heading', { name: 'Best of the session' })
		).toBeDefined();
	});

	describe('per-section show/hide', () => {
		it('shows only the Rarities section when only a rarity highlight is present', () => {
			renderSessionHighlights({ highlights: [RARITY_HIGHLIGHT] });
			expect(screen.getByRole('heading', { name: 'Rarities' })).toBeDefined();
			expect(screen.queryByTestId('counts')).toBeNull();
			expect(screen.queryByTestId('vital-stats')).toBeNull();
		});

		it('shows only the Counts section when only a count highlight is present', () => {
			renderSessionHighlights({ highlights: [COUNT_HIGHLIGHT] });
			expect(screen.getByRole('heading', { name: 'Counts' })).toBeDefined();
			expect(screen.queryByTestId('rarities')).toBeNull();
			expect(screen.queryByTestId('vital-stats')).toBeNull();
		});

		it('shows only the Vital stats section when only a biometrics highlight is present', () => {
			renderSessionHighlights({ highlights: [VITAL_STAT_HIGHLIGHT] });
			expect(
				screen.getByRole('heading', { name: 'Vital stats' })
			).toBeDefined();
			expect(screen.queryByTestId('rarities')).toBeNull();
			expect(screen.queryByTestId('counts')).toBeNull();
		});
	});

	describe('"Best of the session" — prop-fed, independent of the fetch', () => {
		it('renders the oldest-bird sentence in the existing "Oldest: N years — Species (RING)" format', () => {
			renderSessionHighlights({ oldestEncounter: makeOldestEncounter(5) });
			expect(screen.getByTestId('best-of-session').textContent).toBe(
				'Oldest: 5 years — Robin (ABC001)'
			);
		});

		it('renders it even when the tab fetched no highlights at all', () => {
			renderSessionHighlights({
				highlights: null,
				oldestEncounter: makeOldestEncounter(5)
			});
			expect(
				screen.getByRole('heading', { name: 'Best of the session' })
			).toBeDefined();
			expect(screen.queryByRole('heading', { name: 'Rarities' })).toBeNull();
		});

		it('renders nothing for an oldest encounter with proven_age 0', () => {
			const { container } = renderSessionHighlights({
				oldestEncounter: makeOldestEncounter(0)
			});
			expect(container.innerHTML).toBe('');
		});
	});

	it('renders nothing when there are no highlights and no oldest encounter', () => {
		const { container } = renderSessionHighlights();
		expect(container.innerHTML).toBe('');
	});
});
