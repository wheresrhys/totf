import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { EncountersTable } from '../EncountersTable';
import type { EncounterOfBird } from '@/app/models/bird';
import {
	getCellByHeading,
	getCellTextByHeading
} from '@/app/__tests__/helpers/table';

const COLUMN_HEADINGS = [
	'Date',
	'Time',
	'Age',
	'Sex',
	'Wing',
	'Weight',
	'Breeding Condition',
	'Moult',
	'OGC',
	'Fat',
	'Pectoral Muscle',
	'Notes'
];

function makeEncounter(
	id: number,
	overrides: {
		visit_date?: string;
		capture_time?: string;
		age_code?: number;
		is_juv?: boolean;
		sex?: string;
		sexing_method?: string | null;
		wing_length?: number | null;
		weight?: number | null;
		breeding_condition?: string | null;
		moult_code?: string | null;
		primary_moult?: string | null;
		old_greater_coverts?: number | null;
		fat?: string | null;
		pectoral_muscle?: number | null;
		extra_text?: string | null;
	} = {}
): EncounterOfBird {
	const visitDate = overrides.visit_date ?? '2024-01-01';
	return {
		id,
		bird_id: 1,
		age_code: overrides.age_code ?? 4,
		is_juv: overrides.is_juv ?? false,
		breeding_condition: overrides.breeding_condition ?? null,
		capture_method: null,
		capture_time: overrides.capture_time ?? '09:00:00',
		extra_text: overrides.extra_text ?? null,
		fat: overrides.fat ?? null,
		finding_circumstances: null,
		finding_condition: null,
		location_id: 1,
		lure_code_1: null,
		lure_code_2: null,
		max_hatch_year: 2020,
		min_hatch_year: 2020,
		moult_code: overrides.moult_code ?? null,
		old_greater_coverts: overrides.old_greater_coverts ?? null,
		pectoral_muscle: overrides.pectoral_muscle ?? null,
		primary_moult: overrides.primary_moult ?? null,
		record_type: 'N',
		ringing_group_id: 1,
		scheme: 'GBT',
		session_id: 1,
		sex: overrides.sex ?? 'M',
		sexing_method: overrides.sexing_method ?? null,
		visit_date: visitDate,
		weight: overrides.weight ?? null,
		wing_length: overrides.wing_length ?? null,
		session: {
			id: 1,
			ringing_group_id: 1,
			visit_date: visitDate
		}
	} as EncounterOfBird;
}

const headerLabels = () =>
	screen.getAllByRole('columnheader').map((header) => header.textContent);

describe('EncountersTable', () => {
	afterEach(() => {
		cleanup();
	});

	describe('standard column rendering', () => {
		it('renders all 12 column headings in order', () => {
			render(<EncountersTable encounters={[makeEncounter(1)]} />);
			expect(headerLabels()).toEqual(COLUMN_HEADINGS);
		});

		it('renders one row per encounter', () => {
			const encounters = [makeEncounter(1), makeEncounter(2), makeEncounter(3)];
			render(<EncountersTable encounters={encounters} />);
			expect(document.querySelectorAll('tbody tr')).toHaveLength(
				encounters.length
			);
		});
	});

	describe('Age column (age_code + is_juv merge)', () => {
		it('appends J when is_juv is true', () => {
			render(
				<EncountersTable
					encounters={[makeEncounter(1, { age_code: 3, is_juv: true })]}
				/>
			);
			expect(getCellTextByHeading('Age', 0)).toBe('3J');
		});

		it('renders the bare age code when is_juv is false', () => {
			render(
				<EncountersTable
					encounters={[makeEncounter(1, { age_code: 3, is_juv: false })]}
				/>
			);
			expect(getCellTextByHeading('Age', 0)).toBe('3');
		});
	});

	describe('Sex column (sex + sexing_method merge)', () => {
		it('renders sexing_method in parentheses when present', () => {
			render(
				<EncountersTable
					encounters={[
						makeEncounter(1, { sex: 'M', sexing_method: 'plumage' })
					]}
				/>
			);
			expect(getCellTextByHeading('Sex', 0)).toBe('M (plumage)');
		});

		it('renders the bare sex value with no parens when sexing_method is absent', () => {
			render(
				<EncountersTable
					encounters={[makeEncounter(1, { sex: 'M', sexing_method: null })]}
				/>
			);
			expect(getCellTextByHeading('Sex', 0)).toBe('M');
		});
	});

	describe('Moult column (moult_code + primary_moult merge)', () => {
		it('renders moult_code with primary_moult on a second, smaller line', () => {
			render(
				<EncountersTable
					encounters={[
						makeEncounter(1, { moult_code: 'C', primary_moult: '5554433' })
					]}
				/>
			);
			const cell = getCellByHeading('Moult', 0);
			const lines = cell.querySelectorAll('div');
			expect(lines).toHaveLength(2);
			expect(lines[0].textContent).toBe('C');
			expect(lines[1].textContent).toBe('5554433');
			expect(lines[1].className).toContain('text-xs');
		});

		it('renders only the moult_code line, with no stray second line, when primary_moult is null', () => {
			render(
				<EncountersTable
					encounters={[
						makeEncounter(1, { moult_code: 'C', primary_moult: null })
					]}
				/>
			);
			const cell = getCellByHeading('Moult', 0);
			expect(cell.querySelectorAll('div')).toHaveLength(1);
			expect(cell.textContent).toBe('C');
		});
	});

	describe('null-safe rendering of optional columns', () => {
		const nullEncounter = makeEncounter(1, {
			wing_length: null,
			weight: null,
			breeding_condition: null,
			old_greater_coverts: null,
			fat: null,
			pectoral_muscle: null,
			extra_text: null
		});

		it.each([
			'Wing',
			'Weight',
			'Breeding Condition',
			'OGC',
			'Fat',
			'Pectoral Muscle',
			'Notes'
		] as const)('renders an empty cell, not "null", for %s', (heading) => {
			render(<EncountersTable encounters={[nullEncounter]} />);
			expect(getCellTextByHeading(heading, 0)).toBe('');
		});
	});

	describe('sorting', () => {
		it('sorts by a plain column (Wing) on header click', () => {
			const encounters = [
				makeEncounter(1, { wing_length: 50 }),
				makeEncounter(2, { wing_length: 90 }),
				makeEncounter(3, { wing_length: 30 })
			];
			render(<EncountersTable encounters={encounters} />);
			fireEvent.click(screen.getByText('Wing'));
			// descending by wing: id 2 (90), id 1 (50), id 3 (30)
			const rows = document.querySelectorAll('tbody tr');
			expect(rows[0].textContent).toContain('90');
			expect(rows[1].textContent).toContain('50');
			expect(rows[2].textContent).toContain('30');
		});

		it('sorts by the merged Sex column using the bare sex value', () => {
			const encounters = [
				makeEncounter(1, { sex: 'M', sexing_method: 'plumage' }),
				makeEncounter(2, { sex: 'F', sexing_method: null }),
				makeEncounter(3, { sex: 'U', sexing_method: null })
			];
			render(<EncountersTable encounters={encounters} />);
			fireEvent.click(screen.getByText('Sex'));
			// descending by bare sex value: U, M, F
			const rows = document.querySelectorAll('tbody tr');
			expect(rows[0].textContent).toContain('U');
			expect(rows[1].textContent).toContain('M (plumage)');
			expect(rows[2].textContent).toContain('F');
		});
	});
});
