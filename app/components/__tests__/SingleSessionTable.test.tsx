import { describe, it, expect, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	within
} from '@testing-library/react';
import { SessionTabs } from '../SingleSessionTable';
import type { SpeciesWithEncounters } from '../SingleSessionTable';
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
		render(<SessionTabs speciesList={speciesList} netRounds={netRounds} />);
		expect(
			screen.getByRole('button', { name: 'By species' }).textContent
		).toContain('By species');
		expect(
			screen.getByRole('button', { name: 'By time' }).textContent
		).toContain('By time');
	});

	it('shows species table by default', () => {
		render(<SessionTabs speciesList={speciesList} netRounds={netRounds} />);
		expect(screen.getByTestId('session-table')).not.toBeNull();
	});

	it('shows the max proven age per species row', () => {
		render(<SessionTabs speciesList={speciesList} netRounds={netRounds} />);
		const robinRow = screen.getByText('Robin').closest('tr') as HTMLElement;
		expect(robinRow.textContent).toContain('7');
	});

	it('shows proven age per encounter in the by-time view', () => {
		render(<SessionTabs speciesList={speciesList} netRounds={netRounds} />);
		fireEvent.click(screen.getByRole('button', { name: 'By time' }));
		expect(
			screen.getAllByRole('columnheader').map((c) => c.textContent)
		).toContain('Proven Age');
	});

	it('shows chronological view when By time tab clicked', () => {
		render(<SessionTabs speciesList={speciesList} netRounds={netRounds} />);
		fireEvent.click(screen.getByRole('button', { name: 'By time' }));
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
				/>
			);
			expect(columnCellValue('Juv', 'Dunnock')).toBe('1');
			expect(columnCellValue('Postjuv', 'Dunnock')).toBe('0');
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
				/>
			);
			expect(columnCellValue('Postjuv', 'Chaffinch')).toBe('1');
			expect(columnCellValue('Juv', 'Chaffinch')).toBe('0');
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
				'Unaged',
				'Max Proven Age'
			]);
		});
	});

	describe('pulli column visibility', () => {
		it('hides the Pulli column when the session caught no pulli', () => {
			render(<SessionTabs speciesList={speciesList} netRounds={netRounds} />);
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
				/>
			);
			expect(
				screen.getAllByRole('columnheader').map((header) => header.textContent)
			).toContain('Pulli');
		});
	});

	describe('column styling', () => {
		it('renders the Total value in bold', () => {
			render(<SessionTabs speciesList={speciesList} netRounds={netRounds} />);
			const headers = screen.getAllByRole('columnheader');
			const totalIndex = headers.findIndex(
				(header) => header.textContent === 'Total'
			);
			const robinRow = screen.getByText('Robin').closest('tr') as HTMLElement;
			const cells = within(robinRow).getAllByRole('cell');
			expect(cells[totalIndex].className).toContain('font-bold');
		});

		it('applies a distinct background colour to each of the New/Retrap/Juv/Postjuv/Adult/Unaged columns', () => {
			render(<SessionTabs speciesList={speciesList} netRounds={netRounds} />);
			const headers = screen.getAllByRole('columnheader');
			const backgroundClassFor = (label: string) =>
				headers.find((header) => header.textContent === label)?.className;
			expect(backgroundClassFor('New')).toContain('bg-green-50');
			expect(backgroundClassFor('Retrap')).toContain('bg-amber-50');
			expect(backgroundClassFor('Juv')).toContain('bg-sky-50');
			expect(backgroundClassFor('Postjuv')).toContain('bg-blue-50');
			expect(backgroundClassFor('Adult')).toContain('bg-purple-50');
			expect(backgroundClassFor('Unaged')).toContain('bg-taupe-50');
		});

		it('draws a thicker left border on Juv (as the first age-class column) when Pulli is hidden', () => {
			render(<SessionTabs speciesList={speciesList} netRounds={netRounds} />);
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
			render(<SessionTabs speciesList={speciesList} netRounds={netRounds} />);
			const headers = screen.getAllByRole('columnheader');
			const unagedHeader = headers.find(
				(header) => header.textContent === 'Unaged'
			);
			expect(unagedHeader?.className).toContain('border-r-4');
		});
	});
});
