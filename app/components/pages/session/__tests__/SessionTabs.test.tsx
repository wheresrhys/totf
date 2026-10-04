import { describe, it, expect, afterEach, vi } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	within
} from '@testing-library/react';
import { SessionTabs, buildSessionTabs } from '../SessionTabs';
import type { CombinedHighlight } from '@/app/lib/highlights/types';
import type { NetRound } from '@/app/lib/session-chronology';
import type {
	SessionEncounter,
	SpeciesWithEncounters
} from '@/app/models/session';
import {
	getCellByHeading,
	getCellTextByHeading
} from '@/app/__tests__/helpers/table';

// The Highlights tab fetches through this; mock it as the one collaborator it
// is, so opening that tab in a test never reaches the real stats pipeline.
vi.mock('@/app/lib/highlights', () => ({
	getCondensedHighlightsAtTimePeriod: vi.fn().mockResolvedValue([])
}));

function makeEncounter(
	id: number,
	species: string,
	capture_time: string,
	proven_age = 0,
	ageOptions: { age_code?: number; is_juv?: boolean } = {},
	capture_method: string | null = 'M'
): SessionEncounter {
	return {
		id,
		session_id: 1,
		age_code: ageOptions.age_code ?? 4,
		is_juv: ageOptions.is_juv ?? false,
		breeding_condition: null,
		capture_method,
		capture_time,
		moult_code: null,
		record_type: 'N',
		ringing_group_id: 1,
		sex: 'M',
		sexing_method: null,
		weight: null,
		wing_length: null,
		bird: {
			ring_no: `RING${id}`,
			proven_age,
			species: { id: 1, species_name: species }
		}
	} as SessionEncounter;
}

function totalsRowCellValue(columnLabel: string): string {
	const totalsRow = screen.getByTestId('totals-row');
	return getCellTextByHeading(columnLabel, totalsRow) ?? '';
}

const robinEncounter = makeEncounter(1, 'Robin', '09:00:00', 3);
const olderRobinEncounter = makeEncounter(3, 'Robin', '09:15:00', 7);
const titmouseEncounter = makeEncounter(2, 'Blue Tit', '09:30:00');

const mistNetSpeciesList: SpeciesWithEncounters[] = [
	{ species: 'Robin', encounters: [robinEncounter, olderRobinEncounter] },
	{ species: 'Blue Tit', encounters: [titmouseEncounter] }
];

const netRounds: NetRound[] = [
	{ startTime: '09:00:00', encounters: [robinEncounter] },
	{ startTime: '09:30:00', encounters: [titmouseEncounter] }
];

function renderSessionTabs(
	overrides: Partial<{
		mistNetSpeciesList: SpeciesWithEncounters[];
		otherCatchesSpeciesList: SpeciesWithEncounters[];
		netRounds: NetRound[];
		oldestEncounter: SessionEncounter | null;
		date: string;
		initialTabId: string;
		initialTabData: { tabId: string; data: unknown };
	}> = {}
) {
	const { initialTabId, initialTabData, ...params } = {
		mistNetSpeciesList,
		otherCatchesSpeciesList: [] as SpeciesWithEncounters[],
		netRounds,
		oldestEncounter: null as SessionEncounter | null,
		date: '2024-09-15',
		...overrides
	};
	return render(
		<SessionTabs
			params={params}
			viewedGroup={{ id: 1, slug: 'alpha' }}
			initialTabId={initialTabId}
			initialTabData={initialTabData}
		/>
	);
}

const tabIdsFor = (gating: {
	hasMistNetEncounters: boolean;
	hasOtherCatches: boolean;
}) => buildSessionTabs(gating).map((tab) => tab.id);

describe('SessionTabs', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describe('tab list construction', () => {
		it('includes the Mist-netting tab only when the day has mist-net encounters', () => {
			expect(
				tabIdsFor({ hasMistNetEncounters: true, hasOtherCatches: false })
			).toContain('mist-netting');
			expect(
				tabIdsFor({ hasMistNetEncounters: false, hasOtherCatches: false })
			).not.toContain('mist-netting');
		});

		it('includes the Other catches tab only when the day has non-mist-net encounters', () => {
			expect(
				tabIdsFor({ hasMistNetEncounters: false, hasOtherCatches: true })
			).toContain('other-catches');
			expect(
				tabIdsFor({ hasMistNetEncounters: false, hasOtherCatches: false })
			).not.toContain('other-catches');
		});

		it('always includes Net rounds and Highlights, in that order, after the conditional tabs', () => {
			expect(
				tabIdsFor({ hasMistNetEncounters: true, hasOtherCatches: true })
			).toEqual(['mist-netting', 'other-catches', 'net-rounds', 'highlights']);
			expect(
				tabIdsFor({ hasMistNetEncounters: false, hasOtherCatches: false })
			).toEqual(['net-rounds', 'highlights']);
		});

		it('gives only the Highlights tab a dataFetcher — the other three take their data from the page-wide fetch', () => {
			const tabsWithFetchers = buildSessionTabs({
				hasMistNetEncounters: true,
				hasOtherCatches: true
			})
				.filter((tab) => tab.dataFetcher !== undefined)
				.map((tab) => tab.id);
			expect(tabsWithFetchers).toEqual(['highlights']);
		});

		it('declares the Highlights tab clientSideOnly, keeping highlights generation out of the server-side prefetch', () => {
			const highlightsTab = buildSessionTabs({
				hasMistNetEncounters: true,
				hasOtherCatches: true
			}).find((tab) => tab.id === 'highlights');
			expect(highlightsTab?.clientSideOnly).toBe(true);
		});
	});

	it('renders the Mist-netting and Net rounds tab buttons, but not Other catches, by default', () => {
		renderSessionTabs();
		expect(
			screen.getByRole('button', { name: 'Mist-netting' }).textContent
		).toContain('Mist-netting');
		expect(
			screen.getByRole('button', { name: 'Net rounds' }).textContent
		).toContain('Net rounds');
		expect(screen.queryByRole('button', { name: 'Other catches' })).toBeNull();
	});

	it('shows the mist-netting species table by default', () => {
		renderSessionTabs();
		expect(screen.getByTestId('session-table')).not.toBeNull();
	});

	it('shows the max proven age per species row', () => {
		renderSessionTabs();
		const robinRow = screen.getByText('Robin').closest('tr') as HTMLElement;
		expect(robinRow.textContent).toContain('7');
	});

	it('shows proven age per encounter in the net rounds view', () => {
		renderSessionTabs();
		fireEvent.click(screen.getByRole('button', { name: 'Net rounds' }));
		expect(
			screen.getAllByRole('columnheader').map((c) => c.textContent)
		).toContain('Proven Age');
	});

	it('shows chronological view when Net rounds tab clicked', () => {
		renderSessionTabs();
		fireEvent.click(screen.getByRole('button', { name: 'Net rounds' }));
		expect(screen.getByText('Net round 1: 09:00').textContent).toContain(
			'Net round 1: 09:00'
		);
		expect(screen.getByText('Net round 2: 09:30').textContent).toContain(
			'Net round 2: 09:30'
		);
	});

	describe('Mist-netting / Other catches tab visibility (#1022)', () => {
		it('hides the Mist-netting tab entirely on a day with zero mist-net encounters', () => {
			renderSessionTabs({
				mistNetSpeciesList: [],
				otherCatchesSpeciesList: mistNetSpeciesList
			});
			expect(screen.queryByRole('button', { name: 'Mist-netting' })).toBeNull();
		});

		it('shows the Other catches tab when at least one non-mist-net encounter exists', () => {
			renderSessionTabs({ otherCatchesSpeciesList: mistNetSpeciesList });
			expect(
				screen.getByRole('button', { name: 'Other catches' })
			).not.toBeNull();
		});

		it('renders the Other catches species table in its own testId, independent of Mist-netting', () => {
			renderSessionTabs({
				otherCatchesSpeciesList: [
					{
						species: 'Wren',
						encounters: [makeEncounter(99, 'Wren', '10:00:00', 1, {}, 'C')]
					}
				],
				initialTabId: 'other-catches'
			});
			const table = screen.getByTestId('other-catches-table');
			expect(table.textContent).toContain('Wren');
			expect(screen.queryByTestId('session-table')).toBeNull();
		});

		it('defaults to the Other catches tab when Mist-netting is empty but Other catches has data', () => {
			renderSessionTabs({
				mistNetSpeciesList: [],
				otherCatchesSpeciesList: mistNetSpeciesList
			});
			expect(screen.getByTestId('other-catches-table')).not.toBeNull();
			const button = screen.getByRole('button', { name: 'Other catches' });
			expect(button.getAttribute('aria-current')).toBe('true');
		});

		it('defaults to Net rounds when neither Mist-netting nor Other catches has any data', () => {
			renderSessionTabs({
				mistNetSpeciesList: [],
				otherCatchesSpeciesList: [],
				netRounds: []
			});
			expect(screen.queryByRole('button', { name: 'Mist-netting' })).toBeNull();
			expect(
				screen.queryByRole('button', { name: 'Other catches' })
			).toBeNull();
			const button = screen.getByRole('button', { name: 'Net rounds' });
			expect(button.getAttribute('aria-current')).toBe('true');
		});
	});

	describe('Net rounds — EncountersTable adoption', () => {
		function renderAndOpenNetRounds(rounds: NetRound[]) {
			renderSessionTabs({ netRounds: rounds });
			fireEvent.click(screen.getByRole('button', { name: 'Net rounds' }));
		}

		function netRoundHeaders(table: HTMLElement): (string | null)[] {
			return within(table)
				.getAllByRole('columnheader')
				.map((header) => header.textContent);
		}

		it('does not render a Time column header; still renders a Species column header', () => {
			renderAndOpenNetRounds(netRounds);
			const [firstTable] = screen.getAllByTestId('net-round-table');
			const headers = netRoundHeaders(firstTable);
			expect(headers).not.toContain('Time');
			expect(headers).toContain('Species');
		});

		it("sorts a net round's rows on header click, reversing on second click", () => {
			const roundEncounters = [
				makeEncounter(2, 'Robin', '09:00:00'),
				makeEncounter(1, 'Robin', '09:05:00'),
				makeEncounter(3, 'Robin', '09:10:00')
			];
			renderAndOpenNetRounds([
				{ startTime: '09:00:00', encounters: roundEncounters }
			]);
			const [table] = screen.getAllByTestId('net-round-table');
			const ringOrder = () =>
				Array.from(table.querySelectorAll('tbody tr')).map(
					(row) => row.textContent?.match(/RING\d+/)?.[0]
				);
			// Insertion order before any sort.
			expect(ringOrder()).toEqual(['RING2', 'RING1', 'RING3']);
			fireEvent.click(within(table).getByText('Ring No'));
			// First click sorts descending.
			expect(ringOrder()).toEqual(['RING3', 'RING2', 'RING1']);
			fireEvent.click(within(table).getByText('Ring No'));
			// Second click reverses to ascending.
			expect(ringOrder()).toEqual(['RING1', 'RING2', 'RING3']);
		});

		it('renders each net round table using the responsive size pattern, not fixed xs', () => {
			renderAndOpenNetRounds(netRounds);
			screen.getAllByTestId('net-round-table').forEach((table) => {
				expect(table.className).toContain('sm:table-md');
			});
		});

		it('renders a net round with a single encounter without erroring', () => {
			renderAndOpenNetRounds([
				{ startTime: '09:00:00', encounters: [robinEncounter] }
			]);
			const [table] = screen.getAllByTestId('net-round-table');
			expect(table.querySelectorAll('tbody tr')).toHaveLength(1);
		});

		it('renders a net round with no encounters as an empty table with headers but no rows', () => {
			renderAndOpenNetRounds([{ startTime: '09:00:00', encounters: [] }]);
			const [table] = screen.getAllByTestId('net-round-table');
			expect(within(table).getAllByRole('columnheader').length).toBeGreaterThan(
				0
			);
			expect(table.querySelectorAll('tbody tr')).toHaveLength(0);
		});
	});

	describe('Expanded species row — EncountersTable adoption', () => {
		function renderAndExpandFirstSpecies(list: SpeciesWithEncounters[]) {
			renderSessionTabs({ mistNetSpeciesList: list });
			const sessionTable = screen.getByTestId('session-table');
			const expandButton = sessionTable.querySelector(
				'tbody button'
			) as HTMLElement;
			fireEvent.click(expandButton);
		}

		it('does not render a Species column; renders a Time column', () => {
			renderAndExpandFirstSpecies(mistNetSpeciesList);
			const detailsTable = screen.getByTestId('species-details-table');
			const headers = within(detailsTable)
				.getAllByRole('columnheader')
				.map((header) => header.textContent);
			expect(headers).not.toContain('Species');
			expect(headers).toContain('Time');
		});

		it('renders clickable, sortable column headers (EncountersTable is always sortable)', () => {
			renderAndExpandFirstSpecies(mistNetSpeciesList);
			const detailsTable = screen.getByTestId('species-details-table');
			within(detailsTable)
				.getAllByRole('columnheader')
				.forEach((header) => {
					expect(header.className).toContain('cursor-pointer');
				});
		});

		it('expands a species row with a single encounter without erroring', () => {
			renderAndExpandFirstSpecies([
				{ species: 'Blue Tit', encounters: [titmouseEncounter] }
			]);
			const detailsTable = screen.getByTestId('species-details-table');
			expect(detailsTable.querySelectorAll('tbody tr')).toHaveLength(1);
		});
	});

	describe('juvs/pullus/postjuv columns', () => {
		it('counts an age-1, is_juv-true encounter in the juv column', () => {
			const encounter = makeEncounter(10, 'Wren', '10:00:00', 0, {
				age_code: 1,
				is_juv: true
			});
			renderSessionTabs({
				mistNetSpeciesList: [{ species: 'Wren', encounters: [encounter] }],
				netRounds: []
			});
			expect(getCellTextByHeading('Juv', 'Wren')).toBe('1');
			expect(getCellTextByHeading('Postjuv', 'Wren')).toBe('0');
		});

		it('counts an age-3, is_juv-true encounter in the juv column', () => {
			const encounter = makeEncounter(11, 'Dunnock', '10:00:00', 0, {
				age_code: 3,
				is_juv: true
			});
			renderSessionTabs({
				mistNetSpeciesList: [{ species: 'Dunnock', encounters: [encounter] }],
				netRounds: []
			});
			expect(getCellTextByHeading('Juv', 'Dunnock')).toBe('1');
			expect(getCellTextByHeading('Postjuv', 'Dunnock')).toBe('0');
		});

		it('counts an age-code-greater-than-3, is_juv-true encounter in the juv column, not the adult column', () => {
			const encounter = makeEncounter(14, 'Starling', '10:00:00', 0, {
				age_code: 5,
				is_juv: true
			});
			renderSessionTabs({
				mistNetSpeciesList: [{ species: 'Starling', encounters: [encounter] }],
				netRounds: []
			});
			expect(getCellTextByHeading('Juv', 'Starling')).toBe('1');
			expect(getCellTextByHeading('Adult', 'Starling')).toBe('0');
		});

		it('counts an age-1, is_juv-false (pulli) encounter in the pulli column, not juv', () => {
			const encounter = makeEncounter(12, 'Swallow', '10:00:00', 0, {
				age_code: 1,
				is_juv: false
			});
			renderSessionTabs({
				mistNetSpeciesList: [{ species: 'Swallow', encounters: [encounter] }],
				netRounds: []
			});
			expect(getCellTextByHeading('Pulli', 'Swallow')).toBe('1');
			expect(getCellTextByHeading('Juv', 'Swallow')).toBe('0');
		});

		it('counts an age-3, is_juv-false (bare 3) encounter in the postjuv column, not juv', () => {
			const encounter = makeEncounter(13, 'Chaffinch', '10:00:00', 0, {
				age_code: 3,
				is_juv: false
			});
			renderSessionTabs({
				mistNetSpeciesList: [{ species: 'Chaffinch', encounters: [encounter] }],
				netRounds: []
			});
			expect(getCellTextByHeading('Postjuv', 'Chaffinch')).toBe('1');
			expect(getCellTextByHeading('Juv', 'Chaffinch')).toBe('0');
		});
	});

	describe('column headings', () => {
		it('renders the full heading row in the specified order when the session caught pulli', () => {
			const pulliEncounter = makeEncounter(20, 'Robin', '10:00:00', 0, {
				age_code: 1,
				is_juv: false
			});
			renderSessionTabs({
				mistNetSpeciesList: [
					{ species: 'Robin', encounters: [pulliEncounter] }
				],
				netRounds: []
			});
			expect(
				screen.getAllByRole('columnheader').map((header) => header.textContent)
			).toEqual([
				'Species',
				'Total',
				'New',
				'Retrap',
				'Pulli',
				'Juv',
				'Postjuv',
				'Adult',
				'Not aged',
				'Max Proven Age'
			]);
		});
	});

	describe('pulli column visibility', () => {
		it('hides the Pulli column when the session caught no pulli', () => {
			renderSessionTabs();
			expect(
				screen.getAllByRole('columnheader').map((header) => header.textContent)
			).not.toContain('Pulli');
		});

		it('shows the Pulli column when at least one species in the session caught pulli', () => {
			const pulliEncounter = makeEncounter(21, 'Robin', '10:00:00', 0, {
				age_code: 1,
				is_juv: false
			});
			renderSessionTabs({
				mistNetSpeciesList: [
					...mistNetSpeciesList,
					{ species: 'Wren', encounters: [pulliEncounter] }
				]
			});
			expect(
				screen.getAllByRole('columnheader').map((header) => header.textContent)
			).toContain('Pulli');
		});

		it("decides the Other catches tab's Pulli visibility independently of Mist-netting's", () => {
			const otherCatchesPulliEncounter = makeEncounter(
				23,
				'Wren',
				'10:00:00',
				0,
				{ age_code: 1, is_juv: false },
				'C'
			);
			renderSessionTabs({
				// Mist-netting has no pulli...
				mistNetSpeciesList,
				// ...but Other catches does.
				otherCatchesSpeciesList: [
					{ species: 'Wren', encounters: [otherCatchesPulliEncounter] }
				],
				initialTabId: 'other-catches'
			});
			const otherCatchesTable = screen.getByTestId('other-catches-table');
			expect(
				within(otherCatchesTable)
					.getAllByRole('columnheader')
					.map((header) => header.textContent)
			).toContain('Pulli');
		});
	});

	describe('column styling', () => {
		it('renders the Total value in bold', () => {
			renderSessionTabs();
			expect(getCellByHeading('Total', 'Robin').className).toContain(
				'font-bold'
			);
		});

		it('applies a distinct background colour to each of the New/Retrap/Juv/Postjuv/Adult/Unaged columns', () => {
			renderSessionTabs();
			const headers = screen.getAllByRole('columnheader');
			const backgroundClassFor = (label: string) =>
				headers.find((header) => header.textContent === label)?.className;
			expect(backgroundClassFor('New')).toContain('bg-green-50');
			expect(backgroundClassFor('Retrap')).toContain('bg-amber-50');
			expect(backgroundClassFor('Juv')).toContain('bg-sky-50');
			expect(backgroundClassFor('Postjuv')).toContain('bg-blue-50');
			expect(backgroundClassFor('Adult')).toContain('bg-purple-50');
			expect(backgroundClassFor('Not aged')).toContain('bg-taupe-50');
		});

		it('draws a thicker left border on Juv (as the first age-class column) when Pulli is hidden', () => {
			renderSessionTabs();
			const headers = screen.getAllByRole('columnheader');
			const juvHeader = headers.find((header) => header.textContent === 'Juv');
			expect(juvHeader?.className).toContain('border-l-4');
		});

		it('draws a thicker left border on Pulli (not Juv) when Pulli is shown', () => {
			const pulliEncounter = makeEncounter(22, 'Robin', '10:00:00', 0, {
				age_code: 1,
				is_juv: false
			});
			renderSessionTabs({
				mistNetSpeciesList: [
					{ species: 'Robin', encounters: [pulliEncounter] }
				],
				netRounds: []
			});
			const headers = screen.getAllByRole('columnheader');
			const pulliHeader = headers.find(
				(header) => header.textContent === 'Pulli'
			);
			const juvHeader = headers.find((header) => header.textContent === 'Juv');
			expect(pulliHeader?.className).toContain('border-l-4');
			expect(juvHeader?.className).not.toContain('border-l-4');
		});

		it('draws a thicker right border on the Unaged column', () => {
			renderSessionTabs();
			const headers = screen.getAllByRole('columnheader');
			const unagedHeader = headers.find(
				(header) => header.textContent === 'Not aged'
			);
			expect(unagedHeader?.className).toContain('border-r-4');
		});
	});

	describe('species totals row', () => {
		it('renders a totals row labelled "Total" in the species column', () => {
			renderSessionTabs();
			const totalsRow = screen.getByTestId('totals-row');
			expect(totalsRow.querySelector('td')?.textContent).toBe('Total');
		});

		it('sums the Total column across all species', () => {
			renderSessionTabs();
			// Robin: 2 encounters, Blue Tit: 1 encounter.
			expect(totalsRowCellValue('Total')).toBe('3');
		});

		it('sums the New/Retrap/Juv/Postjuv/Adult/Not aged columns across all species', () => {
			renderSessionTabs();
			// All three fixture encounters are record_type 'N', age_code 4,
			// is_juv false — i.e. "New" and "Adult", nothing else.
			expect(totalsRowCellValue('New')).toBe('3');
			expect(totalsRowCellValue('Retrap')).toBe('0');
			expect(totalsRowCellValue('Juv')).toBe('0');
			expect(totalsRowCellValue('Postjuv')).toBe('0');
			expect(totalsRowCellValue('Adult')).toBe('3');
			expect(totalsRowCellValue('Not aged')).toBe('0');
		});

		it('shows the maximum, not the sum, of maxProvenAge in the Max Proven Age totals cell', () => {
			renderSessionTabs();
			// Robin's proven ages are 3 and 7 (max 7); Blue Tit's is 0 — the
			// totals cell should show 7, not 7 + 0 or 3 + 7.
			expect(totalsRowCellValue('Max Proven Age')).toBe('7');
		});

		it('includes a Pulli totals cell, correctly summed, when the session caught pulli', () => {
			const pulliEncounter = makeEncounter(40, 'Wren', '10:00:00', 0, {
				age_code: 1,
				is_juv: false
			});
			const anotherPulliEncounter = makeEncounter(41, 'Wren', '10:05:00', 0, {
				age_code: 1,
				is_juv: false
			});
			renderSessionTabs({
				mistNetSpeciesList: [
					{
						species: 'Wren',
						encounters: [pulliEncounter, anotherPulliEncounter]
					}
				],
				netRounds: []
			});
			expect(totalsRowCellValue('Pulli')).toBe('2');
		});

		it('omits the Pulli totals cell when the session caught no pulli', () => {
			renderSessionTabs();
			const totalsRow = screen.getByTestId('totals-row');
			const headers = screen
				.getAllByRole('columnheader')
				.map((header) => header.textContent);
			expect(headers).not.toContain('Pulli');
			expect(totalsRow.querySelectorAll('td').length).toBe(headers.length);
		});

		it('keeps totals row values unchanged after sorting the table by a different column', () => {
			renderSessionTabs();
			const beforeSort = totalsRowCellValue('Total');
			fireEvent.click(screen.getByRole('columnheader', { name: /Species/ }));
			expect(totalsRowCellValue('Total')).toBe(beforeSort);
			expect(totalsRowCellValue('Max Proven Age')).toBe('7');
		});

		it('shows a totals row matching the single row exactly when only one species was caught', () => {
			const encounter = makeEncounter(50, 'Wren', '10:00:00', 5, {
				age_code: 1,
				is_juv: false
			});
			renderSessionTabs({
				mistNetSpeciesList: [{ species: 'Wren', encounters: [encounter] }],
				netRounds: []
			});
			expect(totalsRowCellValue('Total')).toBe(
				getCellTextByHeading('Total', 'Wren')
			);
			expect(totalsRowCellValue('New')).toBe(
				getCellTextByHeading('New', 'Wren')
			);
			expect(totalsRowCellValue('Pulli')).toBe(
				getCellTextByHeading('Pulli', 'Wren')
			);
			expect(totalsRowCellValue('Max Proven Age')).toBe(
				getCellTextByHeading('Max Proven Age', 'Wren')
			);
		});

		it('renders 0 for a count column where no species had a non-zero value', () => {
			renderSessionTabs();
			expect(totalsRowCellValue('Retrap')).toBe('0');
		});
	});

	describe('initialTabId (#805)', () => {
		it('defaults activeTab to mist-netting when initialTabId is undefined (existing behaviour)', () => {
			renderSessionTabs();
			expect(screen.getByTestId('session-table')).not.toBeNull();
			expect(screen.queryByText('Net round 1: 09:00')).toBeNull();
		});

		it('initialTabId="net-rounds" loads and shows the Net rounds panel on first render, no click', () => {
			renderSessionTabs({ initialTabId: 'net-rounds' });
			expect(screen.getByText('Net round 1: 09:00')).not.toBeNull();
			expect(screen.queryByTestId('session-table')).toBeNull();
		});

		describe('one test per known tab id', () => {
			it.each(['mist-netting', 'other-catches', 'net-rounds', 'highlights'])(
				'initialTabId=%s focuses that tab',
				(tabId) => {
					renderSessionTabs({
						otherCatchesSpeciesList: mistNetSpeciesList,
						initialTabId: tabId
					});
					const button = screen.getByRole('button', {
						name:
							tabId === 'mist-netting'
								? 'Mist-netting'
								: tabId === 'other-catches'
									? 'Other catches'
									: tabId === 'net-rounds'
										? 'Net rounds'
										: 'Highlights'
					});
					expect(button.getAttribute('aria-current')).toBe('true');
				}
			);
		});

		it('initialTabId="not-a-real-tab" falls back to the first tab (mist-netting), with no crash and no blank pane', () => {
			renderSessionTabs({ initialTabId: 'not-a-real-tab' });
			expect(screen.getByTestId('session-table')).not.toBeNull();
		});
	});

	describe('Highlights tab data (#1061)', () => {
		// A v2 highlight carries its own printer, so what the tab renders is
		// whatever that printer returns — a test double here, not the real v2
		// formatting logic (covered by the v2 pipeline's own tests).
		const countHighlight: CombinedHighlight = {
			formatters: {
				combinedHighlightPrinter: () => 'Busiest session ever — 3 birds',
				highlightListPrefixPrinter: () => ''
			},
			descriptor: {
				category: 'count',
				type: 'session-total',
				unit: 'encounter'
			},
			value: { timePeriod: '2024-09-15', value: 3, species: null },
			species: 'Robin',
			bestPosition: 1,
			scopes: []
		};

		async function mockHighlightsPipeline(highlights: CombinedHighlight[]) {
			const { getCondensedHighlightsAtTimePeriod } =
				await import('@/app/lib/highlights');
			vi.mocked(getCondensedHighlightsAtTimePeriod).mockResolvedValue(
				highlights
			);
			return getCondensedHighlightsAtTimePeriod;
		}

		it('fetches highlights client-side, behind a spinner, when the tab is opened', async () => {
			const pipeline = await mockHighlightsPipeline([countHighlight]);
			renderSessionTabs();

			fireEvent.click(screen.getByRole('button', { name: 'Highlights' }));

			expect(document.querySelector('.loading')).not.toBeNull();
			const highlights = await screen.findByTestId('session-highlights');
			expect(pipeline).toHaveBeenCalledWith(1, '2024-09-15', 'day');
			expect(highlights.textContent).toContain(
				'Busiest session ever — 3 birds'
			);
		});

		it('still fetches client-side, behind a spinner, when the tab is deep-linked — it is declared clientSideOnly, so nothing was prefetched', async () => {
			const pipeline = await mockHighlightsPipeline([countHighlight]);
			renderSessionTabs({ initialTabId: 'highlights' });

			expect(document.querySelector('.loading')).not.toBeNull();
			const highlights = await screen.findByTestId('session-highlights');
			expect(pipeline).toHaveBeenCalledWith(1, '2024-09-15', 'day');
			expect(highlights.textContent).toContain(
				'Busiest session ever — 3 birds'
			);
		});
	});
});
