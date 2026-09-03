import { describe, it, expect, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	within
} from '@testing-library/react';
import { SessionTabs } from '../SingleSessionData';
import type { SpeciesWithEncounters } from '../SingleSessionData';
import type { NetRound } from '@/app/models/session-chronology';
import type { SessionEncounter } from '@/app/models/session';

function makeEncounter(
	id: number,
	species: string,
	capture_time: string,
	proven_age = 0,
	ageOptions: { age_code?: number; is_juv?: boolean } = {}
): SessionEncounter {
	return {
		id,
		session_id: 1,
		age_code: ageOptions.age_code ?? 4,
		is_juv: ageOptions.is_juv ?? false,
		breeding_condition: null,
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
	} as unknown as SessionEncounter;
}

function columnCellValue(columnLabel: string, rowText: string): string {
	const headers = screen.getAllByRole('columnheader');
	const columnIndex = headers.findIndex(
		(header) => header.textContent === columnLabel
	);
	const row = screen.getByText(rowText).closest('tr') as HTMLElement;
	const cells = within(row).getAllByRole('cell');
	return cells[columnIndex].textContent ?? '';
}

function totalsRowCellValue(columnLabel: string): string {
	const headers = screen.getAllByRole('columnheader');
	const columnIndex = headers.findIndex(
		(header) => header.textContent === columnLabel
	);
	const totalsRow = screen.getByTestId('totals-row');
	const cells = totalsRow.querySelectorAll('td');
	return cells[columnIndex]?.textContent ?? '';
}

const robinEncounter = makeEncounter(1, 'Robin', '09:00:00', 3);
const olderRobinEncounter = makeEncounter(3, 'Robin', '09:15:00', 7);
const titmouseEncounter = makeEncounter(2, 'Blue Tit', '09:30:00');

const speciesList: SpeciesWithEncounters[] = [
	{ species: 'Robin', encounters: [robinEncounter, olderRobinEncounter] },
	{ species: 'Blue Tit', encounters: [titmouseEncounter] }
];

const netRounds: NetRound[] = [
	{ startTime: '09:00:00', encounters: [robinEncounter] },
	{ startTime: '09:30:00', encounters: [titmouseEncounter] }
];

describe('SessionTabs', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders both tab buttons', () => {
		render(
			<SessionTabs
				speciesList={speciesList}
				netRounds={netRounds}
				locationId={undefined}
				viewedGroupId={1}
				date="2024-09-15"
			/>
		);
		expect(
			screen.getByRole('button', { name: 'Species totals' }).textContent
		).toContain('Species totals');
		expect(
			screen.getByRole('button', { name: 'Net rounds' }).textContent
		).toContain('Net rounds');
	});

	it('shows species table by default', () => {
		render(
			<SessionTabs
				speciesList={speciesList}
				netRounds={netRounds}
				locationId={undefined}
				viewedGroupId={1}
				date="2024-09-15"
			/>
		);
		expect(screen.getByTestId('session-table')).not.toBeNull();
	});

	it('shows the max proven age per species row', () => {
		render(
			<SessionTabs
				speciesList={speciesList}
				netRounds={netRounds}
				locationId={undefined}
				viewedGroupId={1}
				date="2024-09-15"
			/>
		);
		const robinRow = screen.getByText('Robin').closest('tr') as HTMLElement;
		expect(robinRow.textContent).toContain('7');
	});

	it('shows proven age per encounter in the net rounds view', () => {
		render(
			<SessionTabs
				speciesList={speciesList}
				netRounds={netRounds}
				locationId={undefined}
				viewedGroupId={1}
				date="2024-09-15"
			/>
		);
		fireEvent.click(screen.getByRole('button', { name: 'Net rounds' }));
		expect(
			screen.getAllByRole('columnheader').map((c) => c.textContent)
		).toContain('Proven Age');
	});

	it('shows chronological view when Net rounds tab clicked', () => {
		render(
			<SessionTabs
				speciesList={speciesList}
				netRounds={netRounds}
				locationId={undefined}
				viewedGroupId={1}
				date="2024-09-15"
			/>
		);
		fireEvent.click(screen.getByRole('button', { name: 'Net rounds' }));
		expect(screen.getByText('Net round 1: 09:00').textContent).toContain(
			'Net round 1: 09:00'
		);
		expect(screen.getByText('Net round 2: 09:30').textContent).toContain(
			'Net round 2: 09:30'
		);
	});

	describe('juvs/pullus/postjuv columns', () => {
		it('counts an age-1, is_juv-true encounter in the juv column', () => {
			const encounter = makeEncounter(10, 'Wren', '10:00:00', 0, {
				age_code: 1,
				is_juv: true
			});
			render(
				<SessionTabs
					speciesList={[{ species: 'Wren', encounters: [encounter] }]}
					netRounds={[]}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			expect(columnCellValue('Juv', 'Wren')).toBe('1');
			expect(columnCellValue('Postjuv', 'Wren')).toBe('0');
		});

		it('counts an age-3, is_juv-true encounter in the juv column', () => {
			const encounter = makeEncounter(11, 'Dunnock', '10:00:00', 0, {
				age_code: 3,
				is_juv: true
			});
			render(
				<SessionTabs
					speciesList={[{ species: 'Dunnock', encounters: [encounter] }]}
					netRounds={[]}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			expect(columnCellValue('Juv', 'Dunnock')).toBe('1');
			expect(columnCellValue('Postjuv', 'Dunnock')).toBe('0');
		});

		it('counts an age-code-greater-than-3, is_juv-true encounter in the juv column, not the adult column', () => {
			const encounter = makeEncounter(14, 'Starling', '10:00:00', 0, {
				age_code: 5,
				is_juv: true
			});
			render(
				<SessionTabs
					speciesList={[{ species: 'Starling', encounters: [encounter] }]}
					netRounds={[]}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			expect(columnCellValue('Juv', 'Starling')).toBe('1');
			expect(columnCellValue('Adult', 'Starling')).toBe('0');
		});

		it('counts an age-1, is_juv-false (pulli) encounter in the pulli column, not juv', () => {
			const encounter = makeEncounter(12, 'Swallow', '10:00:00', 0, {
				age_code: 1,
				is_juv: false
			});
			render(
				<SessionTabs
					speciesList={[{ species: 'Swallow', encounters: [encounter] }]}
					netRounds={[]}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			expect(columnCellValue('Pulli', 'Swallow')).toBe('1');
			expect(columnCellValue('Juv', 'Swallow')).toBe('0');
		});

		it('counts an age-3, is_juv-false (bare 3) encounter in the postjuv column, not juv', () => {
			const encounter = makeEncounter(13, 'Chaffinch', '10:00:00', 0, {
				age_code: 3,
				is_juv: false
			});
			render(
				<SessionTabs
					speciesList={[{ species: 'Chaffinch', encounters: [encounter] }]}
					netRounds={[]}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			expect(columnCellValue('Postjuv', 'Chaffinch')).toBe('1');
			expect(columnCellValue('Juv', 'Chaffinch')).toBe('0');
		});
	});

	describe('New young column', () => {
		it('counts a new (record_type N), age-1 encounter', () => {
			const encounter = makeEncounter(30, 'Wren', '10:00:00', 0, {
				age_code: 1
			});
			render(
				<SessionTabs
					speciesList={[{ species: 'Wren', encounters: [encounter] }]}
					netRounds={[]}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			expect(columnCellValue('New young', 'Wren')).toBe('1');
		});

		it('counts a new (record_type N), age-3 encounter', () => {
			const encounter = makeEncounter(31, 'Dunnock', '10:00:00', 0, {
				age_code: 3
			});
			render(
				<SessionTabs
					speciesList={[{ species: 'Dunnock', encounters: [encounter] }]}
					netRounds={[]}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			expect(columnCellValue('New young', 'Dunnock')).toBe('1');
		});

		it('excludes a new (record_type N) encounter whose age is neither 1 nor 3', () => {
			const encounter = makeEncounter(32, 'Starling', '10:00:00', 0, {
				age_code: 4
			});
			render(
				<SessionTabs
					speciesList={[{ species: 'Starling', encounters: [encounter] }]}
					netRounds={[]}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			expect(columnCellValue('New young', 'Starling')).toBe('0');
		});

		it('excludes an age-1 retrap (record_type S), despite matching the age criterion', () => {
			const encounter = {
				...makeEncounter(33, 'Swallow', '10:00:00', 0, { age_code: 1 }),
				record_type: 'S'
			};
			render(
				<SessionTabs
					speciesList={[{ species: 'Swallow', encounters: [encounter] }]}
					netRounds={[]}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			expect(columnCellValue('New young', 'Swallow')).toBe('0');
		});
	});

	describe('column headings', () => {
		it('renders the full heading row in the specified order when the session caught pulli', () => {
			const pulliEncounter = makeEncounter(20, 'Robin', '10:00:00', 0, {
				age_code: 1,
				is_juv: false
			});
			render(
				<SessionTabs
					speciesList={[{ species: 'Robin', encounters: [pulliEncounter] }]}
					netRounds={[]}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
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
				'New young',
				'Max Proven Age'
			]);
		});
	});

	describe('pulli column visibility', () => {
		it('hides the Pulli column when the session caught no pulli', () => {
			render(
				<SessionTabs
					speciesList={speciesList}
					netRounds={netRounds}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			expect(
				screen.getAllByRole('columnheader').map((header) => header.textContent)
			).not.toContain('Pulli');
		});

		it('shows the Pulli column when at least one species in the session caught pulli', () => {
			const pulliEncounter = makeEncounter(21, 'Robin', '10:00:00', 0, {
				age_code: 1,
				is_juv: false
			});
			render(
				<SessionTabs
					speciesList={[
						...speciesList,
						{ species: 'Wren', encounters: [pulliEncounter] }
					]}
					netRounds={netRounds}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			expect(
				screen.getAllByRole('columnheader').map((header) => header.textContent)
			).toContain('Pulli');
		});
	});

	describe('column styling', () => {
		it('renders the Total value in bold', () => {
			render(
				<SessionTabs
					speciesList={speciesList}
					netRounds={netRounds}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			const headers = screen.getAllByRole('columnheader');
			const totalIndex = headers.findIndex(
				(header) => header.textContent === 'Total'
			);
			const robinRow = screen.getByText('Robin').closest('tr') as HTMLElement;
			const cells = within(robinRow).getAllByRole('cell');
			expect(cells[totalIndex].className).toContain('font-bold');
		});

		it('applies a distinct background colour to each of the New/Retrap/Juv/Postjuv/Adult/Unaged/New young columns', () => {
			render(
				<SessionTabs
					speciesList={speciesList}
					netRounds={netRounds}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			const headers = screen.getAllByRole('columnheader');
			const backgroundClassFor = (label: string) =>
				headers.find((header) => header.textContent === label)?.className;
			expect(backgroundClassFor('New')).toContain('bg-green-50');
			expect(backgroundClassFor('Retrap')).toContain('bg-amber-50');
			expect(backgroundClassFor('Juv')).toContain('bg-sky-50');
			expect(backgroundClassFor('Postjuv')).toContain('bg-blue-50');
			expect(backgroundClassFor('Adult')).toContain('bg-purple-50');
			expect(backgroundClassFor('Not aged')).toContain('bg-taupe-50');
			expect(backgroundClassFor('New young')).toContain('bg-lime-50');
		});

		it('renders the New young column before Max Proven Age', () => {
			render(
				<SessionTabs
					speciesList={speciesList}
					netRounds={netRounds}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			const headers = screen
				.getAllByRole('columnheader')
				.map((header) => header.textContent);
			expect(headers.indexOf('New young')).toBeLessThan(
				headers.indexOf('Max Proven Age')
			);
		});

		it('draws a thicker left border on Juv (as the first age-class column) when Pulli is hidden', () => {
			render(
				<SessionTabs
					speciesList={speciesList}
					netRounds={netRounds}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			const headers = screen.getAllByRole('columnheader');
			const juvHeader = headers.find((header) => header.textContent === 'Juv');
			expect(juvHeader?.className).toContain('border-l-4');
		});

		it('draws a thicker left border on Pulli (not Juv) when Pulli is shown', () => {
			const pulliEncounter = makeEncounter(22, 'Robin', '10:00:00', 0, {
				age_code: 1,
				is_juv: false
			});
			render(
				<SessionTabs
					speciesList={[{ species: 'Robin', encounters: [pulliEncounter] }]}
					netRounds={[]}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			const headers = screen.getAllByRole('columnheader');
			const pulliHeader = headers.find(
				(header) => header.textContent === 'Pulli'
			);
			const juvHeader = headers.find((header) => header.textContent === 'Juv');
			expect(pulliHeader?.className).toContain('border-l-4');
			expect(juvHeader?.className).not.toContain('border-l-4');
		});

		it('draws a thicker right border on the Unaged column', () => {
			render(
				<SessionTabs
					speciesList={speciesList}
					netRounds={netRounds}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			const headers = screen.getAllByRole('columnheader');
			const unagedHeader = headers.find(
				(header) => header.textContent === 'Not aged'
			);
			expect(unagedHeader?.className).toContain('border-r-4');
		});
	});

	describe('species totals row', () => {
		it('renders a totals row labelled "Total" in the species column', () => {
			render(
				<SessionTabs
					speciesList={speciesList}
					netRounds={netRounds}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			const totalsRow = screen.getByTestId('totals-row');
			expect(totalsRow.querySelector('td')?.textContent).toBe('Total');
		});

		it('sums the Total column across all species', () => {
			render(
				<SessionTabs
					speciesList={speciesList}
					netRounds={netRounds}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			// Robin: 2 encounters, Blue Tit: 1 encounter.
			expect(totalsRowCellValue('Total')).toBe('3');
		});

		it('sums the New/Retrap/Juv/Postjuv/Adult/Not aged/New young columns across all species', () => {
			render(
				<SessionTabs
					speciesList={speciesList}
					netRounds={netRounds}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			// All three fixture encounters are record_type 'N', age_code 4,
			// is_juv false — i.e. "New" and "Adult", nothing else.
			expect(totalsRowCellValue('New')).toBe('3');
			expect(totalsRowCellValue('Retrap')).toBe('0');
			expect(totalsRowCellValue('Juv')).toBe('0');
			expect(totalsRowCellValue('Postjuv')).toBe('0');
			expect(totalsRowCellValue('Adult')).toBe('3');
			expect(totalsRowCellValue('Not aged')).toBe('0');
			expect(totalsRowCellValue('New young')).toBe('0');
		});

		it('shows the maximum, not the sum, of maxProvenAge in the Max Proven Age totals cell', () => {
			render(
				<SessionTabs
					speciesList={speciesList}
					netRounds={netRounds}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
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
			render(
				<SessionTabs
					speciesList={[
						{
							species: 'Wren',
							encounters: [pulliEncounter, anotherPulliEncounter]
						}
					]}
					netRounds={[]}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			expect(totalsRowCellValue('Pulli')).toBe('2');
		});

		it('omits the Pulli totals cell when the session caught no pulli', () => {
			render(
				<SessionTabs
					speciesList={speciesList}
					netRounds={netRounds}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			const totalsRow = screen.getByTestId('totals-row');
			const headers = screen
				.getAllByRole('columnheader')
				.map((header) => header.textContent);
			expect(headers).not.toContain('Pulli');
			expect(totalsRow.querySelectorAll('td').length).toBe(headers.length);
		});

		it('keeps totals row values unchanged after sorting the table by a different column', () => {
			render(
				<SessionTabs
					speciesList={speciesList}
					netRounds={netRounds}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
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
			render(
				<SessionTabs
					speciesList={[{ species: 'Wren', encounters: [encounter] }]}
					netRounds={[]}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			expect(totalsRowCellValue('Total')).toBe(
				columnCellValue('Total', 'Wren')
			);
			expect(totalsRowCellValue('New')).toBe(columnCellValue('New', 'Wren'));
			expect(totalsRowCellValue('Pulli')).toBe(
				columnCellValue('Pulli', 'Wren')
			);
			expect(totalsRowCellValue('Max Proven Age')).toBe(
				columnCellValue('Max Proven Age', 'Wren')
			);
		});

		it('renders 0 for a count column where no species had a non-zero value', () => {
			render(
				<SessionTabs
					speciesList={speciesList}
					netRounds={netRounds}
					locationId={undefined}
					viewedGroupId={1}
					date="2024-09-15"
				/>
			);
			expect(totalsRowCellValue('Retrap')).toBe('0');
		});
	});

	it.skip('renders session highlights in a tab', async () => {
		render(
			<SessionTabs
				speciesList={speciesList}
				netRounds={netRounds}
				locationId={undefined}
				viewedGroupId={1}
				date="2024-09-15"
			/>
		);
		expect(screen.getByRole('button', { name: 'Highlights' })).not.toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Highlights' }));
		const highlights = await screen.findByTestId('session-highlights');
		expect(highlights.textContent).toContain('Highlights');
		expect(highlights.textContent).toContain('Busiest session ever — 3 birds');
	});
});
