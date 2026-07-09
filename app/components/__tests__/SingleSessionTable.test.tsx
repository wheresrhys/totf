import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SessionTabs } from '../SingleSessionTable';
import type { SpeciesWithEncounters } from '../SingleSessionTable';
import type { NetRound } from '@/app/models/session-chronology';
import type { SessionEncounter } from '@/app/models/session';

function makeEncounter(
	id: number,
	species: string,
	capture_time: string
): SessionEncounter {
	return {
		id,
		session_id: 1,
		age_code: 4,
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
			species: { id: 1, species_name: species }
		}
	} as unknown as SessionEncounter;
}

const robinEncounter = makeEncounter(1, 'Robin', '09:00:00');
const titmouseEncounter = makeEncounter(2, 'Blue Tit', '09:30:00');

const speciesList: SpeciesWithEncounters[] = [
	{ species: 'Robin', encounters: [robinEncounter] },
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
});
