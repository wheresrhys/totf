import { describe, it, expect } from 'vitest';
import {
	calculateSessionChronology,
	NET_ROUND_GAP_MINUTES
} from '../session-chronology';
import type { SessionEncounter } from '../session';

function makeEncounter(
	id: number,
	capture_time: string | null
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
			species: { id: 1, species_name: 'Robin' }
		}
	} as unknown as SessionEncounter;
}

describe('calculateSessionChronology', () => {
	it('returns nulls for empty encounters', () => {
		const result = calculateSessionChronology([]);
		expect(result).toEqual({
			startTime: null,
			endTime: null,
			durationMinutes: null,
			netRounds: []
		});
	});

	it('skips encounters with null capture_time', () => {
		const result = calculateSessionChronology([makeEncounter(1, null)]);
		expect(result).toEqual({
			startTime: null,
			endTime: null,
			durationMinutes: null,
			netRounds: []
		});
	});

	it('handles single encounter', () => {
		const result = calculateSessionChronology([makeEncounter(1, '09:00:00')]);
		expect(result.startTime).toBe('09:00:00');
		expect(result.endTime).toBe('09:00:00');
		expect(result.durationMinutes).toBe(0);
		expect(result.netRounds).toHaveLength(1);
		expect(result.netRounds[0].startTime).toBe('09:00:00');
	});

	it('merges encounters less than gap apart into same round', () => {
		const result = calculateSessionChronology([
			makeEncounter(1, '09:00:00'),
			makeEncounter(2, '09:10:00')
		]);
		expect(result.netRounds).toHaveLength(1);
		expect(result.netRounds[0].encounters).toHaveLength(2);
	});

	it(`starts new round at exactly ${NET_ROUND_GAP_MINUTES} minutes`, () => {
		const result = calculateSessionChronology([
			makeEncounter(1, '09:00:00'),
			makeEncounter(2, '09:15:00')
		]);
		expect(result.netRounds).toHaveLength(2);
	});

	it('groups by round start, not previous timestamp', () => {
		// 09:00, 09:10, 09:20: 09:10 merges (< 15 from round start 09:00),
		// 09:20 is 20 min from round start 09:00 → new round
		const result = calculateSessionChronology([
			makeEncounter(1, '09:00:00'),
			makeEncounter(2, '09:10:00'),
			makeEncounter(3, '09:20:00')
		]);
		expect(result.netRounds).toHaveLength(2);
		expect(result.netRounds[0].encounters).toHaveLength(2);
		expect(result.netRounds[1].encounters).toHaveLength(1);
	});

	it('calculates start, end, and duration correctly', () => {
		const result = calculateSessionChronology([
			makeEncounter(1, '08:00:00'),
			makeEncounter(2, '08:30:00'),
			makeEncounter(3, '09:00:00')
		]);
		expect(result.startTime).toBe('08:00:00');
		expect(result.endTime).toBe('09:00:00');
		expect(result.durationMinutes).toBe(60);
	});

	it('sorts encounters by time regardless of input order', () => {
		const result = calculateSessionChronology([
			makeEncounter(3, '09:00:00'),
			makeEncounter(1, '08:00:00'),
			makeEncounter(2, '08:30:00')
		]);
		expect(result.startTime).toBe('08:00:00');
		expect(result.endTime).toBe('09:00:00');
	});
});
