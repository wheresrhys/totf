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
		it('counts an age-1, is_juv-true encounter in the juvs column', () => {
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
			expect(columnCellValue('Juvs', 'Wren')).toBe('1');
			expect(columnCellValue('Pullus', 'Wren')).toBe('0');
			expect(columnCellValue('Postjuv', 'Wren')).toBe('0');
		});

		it('counts an age-3, is_juv-true encounter in the juvs column', () => {
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
			expect(columnCellValue('Juvs', 'Dunnock')).toBe('1');
			expect(columnCellValue('Pullus', 'Dunnock')).toBe('0');
			expect(columnCellValue('Postjuv', 'Dunnock')).toBe('0');
		});

		it('counts an age-1, is_juv-false (pulli) encounter in the new pullus column, not juvs', () => {
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
			expect(columnCellValue('Pullus', 'Swallow')).toBe('1');
			expect(columnCellValue('Juvs', 'Swallow')).toBe('0');
		});

		it('counts an age-3, is_juv-false (bare 3) encounter in the new postjuv column, not juvs', () => {
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
			expect(columnCellValue('Juvs', 'Chaffinch')).toBe('0');
		});
	});
});
