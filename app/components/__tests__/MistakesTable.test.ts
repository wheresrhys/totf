import { describe, it, expect } from 'vitest';
import { makeHighlighter } from '@/app/components/MistakesTable';
import type { EncounterOfBird } from '@/app/models/bird';

function makeEncounters(wingLengths: (number | null)[]): EncounterOfBird[] {
	return wingLengths.map((wing_length, i) => ({
		id: i,
		bird_id: 1,
		wing_length,
		age_code: null,
		sex: 'u',
		sexing_method: null,
		breeding_condition: null,
		capture_time: '00:00',
		is_juv: false,
		max_hatch_year: null,
		min_hatch_year: null,
		moult_code: null,
		record_type: 'C',
		ringing_group_id: 1,
		weight: null,
		session: { visit_date: '2024-01-01' }
	})) as unknown as EncounterOfBird[];
}

describe('makeHighlighter', () => {
	describe('sex', () => {
		it('highlights encounters with known sex', () => {
			const encs = makeEncounters([null]);
			const encounters = [
				{ ...encs[0], id: 1, sex: 'M' },
				{ ...encs[0], id: 2, sex: 'F' },
				{ ...encs[0], id: 3, sex: 'u' },
				{ ...encs[0], id: 4, sex: 'U' }
			] as unknown as EncounterOfBird[];
			const highlight = makeHighlighter('sex', encounters);
			expect(highlight(encounters[0])).toBe(true);
			expect(highlight(encounters[1])).toBe(true);
			expect(highlight(encounters[2])).toBe(false);
			expect(highlight(encounters[3])).toBe(false);
		});
	});

	describe('age', () => {
		it('highlights encounters with age_code >= 2', () => {
			const encs = makeEncounters([null]);
			const encounters = [
				{ ...encs[0], id: 1, age_code: 1 },
				{ ...encs[0], id: 2, age_code: 2 },
				{ ...encs[0], id: 3, age_code: 5 },
				{ ...encs[0], id: 4, age_code: null }
			] as unknown as EncounterOfBird[];
			const highlight = makeHighlighter('age', encounters);
			expect(highlight(encounters[0])).toBe(false);
			expect(highlight(encounters[1])).toBe(true);
			expect(highlight(encounters[2])).toBe(true);
			expect(highlight(encounters[3])).toBe(false);
		});
	});

	describe('wing_length', () => {
		it('highlights both records when only two measured', () => {
			const encounters = makeEncounters([80, 90]);
			const highlight = makeHighlighter('wing_length', encounters);
			expect(highlight(encounters[0])).toBe(true);
			expect(highlight(encounters[1])).toBe(true);
		});

		it('highlights the outlier in a clear outlier case', () => {
			const encounters = makeEncounters([80, 81, 82, 74]);
			const highlight = makeHighlighter('wing_length', encounters);
			expect(highlight(encounters[0])).toBe(false);
			expect(highlight(encounters[1])).toBe(false);
			expect(highlight(encounters[2])).toBe(false);
			expect(highlight(encounters[3])).toBe(true);
		});

		it('highlights max-distance records when multiple tied', () => {
			const encounters = makeEncounters([80, 80, 90, 90]);
			const highlight = makeHighlighter('wing_length', encounters);
			expect(highlight(encounters[0])).toBe(true);
			expect(highlight(encounters[1])).toBe(true);
			expect(highlight(encounters[2])).toBe(true);
			expect(highlight(encounters[3])).toBe(true);
		});

		it('does not highlight encounters without a wing_length', () => {
			const encounters = makeEncounters([80, null, 90]);
			const highlight = makeHighlighter('wing_length', encounters);
			expect(highlight(encounters[1])).toBe(false);
		});

		it('returns false for all when no measured encounters', () => {
			const encounters = makeEncounters([null, null]);
			const highlight = makeHighlighter('wing_length', encounters);
			expect(highlight(encounters[0])).toBe(false);
			expect(highlight(encounters[1])).toBe(false);
		});
	});

	describe('unknown type', () => {
		it('never highlights', () => {
			const encounters = makeEncounters([80]);
			const highlight = makeHighlighter('unknown', encounters);
			expect(highlight(encounters[0])).toBe(false);
		});
	});
});
