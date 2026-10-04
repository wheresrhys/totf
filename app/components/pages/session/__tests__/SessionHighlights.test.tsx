import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SessionHighlights } from '../SessionHighlights';
import {
	fetchSessionHighlightLines,
	type SessionHighlightLine,
	type SessionTabParams
} from '../session-tab-config';
import type { CombinedHighlight } from '@/app/lib/highlights/types';
import type { SessionEncounter } from '@/app/models/session';

// Rarities (#990), Counts (#989) and Vital stats all come from the highlights
// pipeline's getCondensedHighlightsAtTimePeriod — see session-tab-config.ts.
// Mock it as the one collaborator it is.
vi.mock('@/app/lib/highlights', () => ({
	getCondensedHighlightsAtTimePeriod: vi.fn()
}));

function makeHighlightLine(
	category: SessionHighlightLine['category'],
	text: string
): SessionHighlightLine {
	return { category, key: `${category}-${text}`, text };
}

const RARITY_LINE = makeHighlightLine('rarity', 'First Firecrest ever');
const COUNT_LINE = makeHighlightLine(
	'count',
	'Busiest session ever — 74 birds'
);
const VITAL_STAT_LINE = makeHighlightLine(
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
	lines = [] as SessionHighlightLine[] | null,
	oldestEncounter = null as SessionEncounter | null
} = {}) {
	const params = {
		date: '2024-09-15',
		mistNetSpeciesList: [],
		otherCatchesSpeciesList: [],
		netRounds: [],
		oldestEncounter
	} satisfies SessionTabParams;
	return render(<SessionHighlights params={params} data={lines} />);
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('fetchSessionHighlightLines', () => {
	// A v2 highlight fixture — treat getCondensedHighlightsAtTimePeriod as a
	// black box: the printer is a test double returning a fixed sentence, not
	// the real v2 formatting logic (covered by the v2 pipeline's own tests).
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
			species: 'Robin',
			bestPosition: 1,
			scopes: []
		};
	}

	async function mockPipeline(highlights: CombinedHighlight[]) {
		const { getCondensedHighlightsAtTimePeriod } =
			await import('@/app/lib/highlights');
		vi.mocked(getCondensedHighlightsAtTimePeriod).mockResolvedValue(highlights);
		return getCondensedHighlightsAtTimePeriod;
	}

	it("asks the pipeline for the viewed group's highlights at the day scope", async () => {
		const pipeline = await mockPipeline([]);
		await fetchSessionHighlightLines(
			{ date: '2024-09-15' },
			{ id: 7, slug: 'alpha' }
		);
		expect(pipeline).toHaveBeenCalledWith(7, '2024-09-15', 'day');
	});

	it('flattens each highlight into a serialisable category/key/text line', async () => {
		await mockPipeline([
			makeV2Highlight('count', 'session-total', 'Busiest session ever')
		]);
		const lines = await fetchSessionHighlightLines(
			{ date: '2024-09-15' },
			{ id: 1, slug: 'alpha' }
		);
		expect(lines).toEqual([
			{
				category: 'count',
				key: 'session-total-Robin',
				text: 'Busiest session ever'
			}
		]);
	});
});

describe('SessionHighlights', () => {
	it('renders a Rarities/Counts/Vital stats heading and item per section when all three groups have lines', () => {
		renderSessionHighlights({
			lines: [RARITY_LINE, COUNT_LINE, VITAL_STAT_LINE]
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

	it('renders every section together when lines and an oldest encounter are both present', () => {
		renderSessionHighlights({
			lines: [RARITY_LINE, COUNT_LINE, VITAL_STAT_LINE],
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
		it('shows only the Rarities section when only a rarity line is present', () => {
			renderSessionHighlights({ lines: [RARITY_LINE] });
			expect(screen.getByRole('heading', { name: 'Rarities' })).toBeDefined();
			expect(screen.queryByTestId('counts')).toBeNull();
			expect(screen.queryByTestId('vital-stats')).toBeNull();
		});

		it('shows only the Counts section when only a count line is present', () => {
			renderSessionHighlights({ lines: [COUNT_LINE] });
			expect(screen.getByRole('heading', { name: 'Counts' })).toBeDefined();
			expect(screen.queryByTestId('rarities')).toBeNull();
			expect(screen.queryByTestId('vital-stats')).toBeNull();
		});

		it('shows only the Vital stats section when only a vital-stat line is present', () => {
			renderSessionHighlights({ lines: [VITAL_STAT_LINE] });
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

		it('renders it even when the tab fetched no highlight lines at all', () => {
			renderSessionHighlights({
				lines: null,
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

	it('renders nothing when there are no lines and no oldest encounter', () => {
		const { container } = renderSessionHighlights();
		expect(container.innerHTML).toBe('');
	});
});
