import { describe, it, expect, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	within
} from '@testing-library/react';
import { EncountersTable } from '../EncountersTable';
import type { SessionEncounter } from '@/app/models/session';

function makeEncounter(
	id: number,
	overrides: {
		ring_no?: string;
		species?: string;
		capture_time?: string;
		wing_length?: number | null;
		fat?: string | null;
		pectoral_muscle?: number | null;
		primary_moult?: string | null;
		old_greater_coverts?: number | null;
	} = {}
): SessionEncounter {
	return {
		id,
		session_id: 1,
		age_code: 4,
		is_juv: false,
		breeding_condition: null,
		capture_time: overrides.capture_time ?? '09:00:00',
		fat: overrides.fat ?? null,
		moult_code: null,
		old_greater_coverts: overrides.old_greater_coverts ?? null,
		pectoral_muscle: overrides.pectoral_muscle ?? null,
		primary_moult: overrides.primary_moult ?? null,
		record_type: 'N',
		ringing_group_id: 1,
		sex: 'M',
		sexing_method: null,
		weight: null,
		wing_length: overrides.wing_length ?? null,
		bird: {
			ring_no: overrides.ring_no ?? `RING${id}`,
			proven_age: 0,
			species: { id: 1, species_name: overrides.species ?? 'Robin' }
		}
	} as unknown as SessionEncounter;
}

const STANDARD_COLUMNS = [
	'Time',
	'Ring No',
	'Type',
	'Age',
	'Proven Age',
	'Sex',
	'Sexing Method',
	'Breeding Condition',
	'Wing',
	'Weight',
	'Moult Code',
	'Fat',
	'Pectoral muscle',
	'Primary moult',
	'OGC'
];

const encounters: SessionEncounter[] = [
	makeEncounter(1, { ring_no: 'RING1', wing_length: 50 }),
	makeEncounter(2, { ring_no: 'RING2', wing_length: 90 }),
	makeEncounter(3, { ring_no: 'RING3', wing_length: 30 })
];

const headerLabels = () =>
	screen.getAllByRole('columnheader').map((header) => header.textContent);

const bodyRows = () => document.querySelectorAll('tbody tr');

function columnCellValue(columnLabel: string, rowText: string): string {
	const headers = screen.getAllByRole('columnheader');
	const columnIndex = headers.findIndex(
		(header) => header.textContent === columnLabel
	);
	const row = screen.getByText(rowText).closest('tr') as HTMLElement;
	const cells = within(row).getAllByRole('cell');
	return cells[columnIndex].textContent ?? '';
}

describe('EncountersTable', () => {
	afterEach(() => {
		cleanup();
	});

	describe('Usual', () => {
		it('renders one row per encounter with all standard columns', () => {
			render(<EncountersTable encounters={encounters} />);
			expect(headerLabels()).toEqual(STANDARD_COLUMNS);
			expect(bodyRows()).toHaveLength(encounters.length);
		});

		it('renders Ring No as a link to /bird/[ring_no]', () => {
			render(<EncountersTable encounters={[makeEncounter(1)]} />);
			const link = screen.getByRole('link', { name: 'RING1' });
			expect(link.getAttribute('href')).toBe('/bird/RING1');
		});

		it('renders clickable sortable headers', () => {
			render(<EncountersTable encounters={encounters} />);
			screen.getAllByRole('columnheader').forEach((header) => {
				expect(header.className).toContain('cursor-pointer');
			});
		});

		it('reorders rows on header click', () => {
			render(<EncountersTable encounters={encounters} />);
			// default order: RING1 (50), RING2 (90), RING3 (30)
			expect(bodyRows()[0].textContent).toContain('RING1');
			fireEvent.click(screen.getByText('Wing'));
			// descending by wing: RING2 (90), RING1 (50), RING3 (30)
			const rows = bodyRows();
			expect(rows[0].textContent).toContain('RING2');
			expect(rows[1].textContent).toContain('RING1');
			expect(rows[2].textContent).toContain('RING3');
		});
	});

	describe('Structure', () => {
		describe('size prop', () => {
			it('renders table-xs only when size is "xs"', () => {
				render(<EncountersTable encounters={encounters} size="xs" />);
				const table = document.querySelector('table');
				expect(table?.className).toContain('table-xs');
				expect(table?.className).not.toContain('sm:table-md');
			});

			it('renders table-xs sm:table-md when size is "responsive"', () => {
				render(<EncountersTable encounters={encounters} size="responsive" />);
				const table = document.querySelector('table');
				expect(table?.className).toContain('table-xs');
				expect(table?.className).toContain('sm:table-md');
			});
		});

		describe('showTimeColumn prop', () => {
			it('renders Time column when true', () => {
				render(
					<EncountersTable encounters={encounters} showTimeColumn={true} />
				);
				expect(headerLabels()).toContain('Time');
			});

			it('omits it when false', () => {
				render(
					<EncountersTable encounters={encounters} showTimeColumn={false} />
				);
				expect(headerLabels()).not.toContain('Time');
			});
		});

		describe('showSpeciesColumn prop', () => {
			it("renders Species column with bird's species name when true", () => {
				render(
					<EncountersTable
						encounters={[makeEncounter(1, { species: 'Blue Tit' })]}
						showSpeciesColumn={true}
					/>
				);
				const headers = headerLabels();
				expect(headers).toContain('Species');
				// Species sits after Ring No, before Type.
				expect(headers.indexOf('Species')).toBe(headers.indexOf('Ring No') + 1);
				expect(headers.indexOf('Species')).toBeLessThan(
					headers.indexOf('Type')
				);
				expect(screen.getByText('Blue Tit')).toBeDefined();
			});

			it('omits it when false', () => {
				render(
					<EncountersTable encounters={encounters} showSpeciesColumn={false} />
				);
				expect(headerLabels()).not.toContain('Species');
			});
		});

		describe('fat, pectoral muscle, primary moult, and OGC columns', () => {
			it('renders the encounter fat score value in the Fat column', () => {
				render(
					<EncountersTable encounters={[makeEncounter(1, { fat: '2' })]} />
				);
				expect(columnCellValue('Fat', 'RING1')).toBe('2');
			});

			it('renders an empty cell when fat is null', () => {
				render(
					<EncountersTable encounters={[makeEncounter(1, { fat: null })]} />
				);
				expect(columnCellValue('Fat', 'RING1')).toBe('');
			});

			it('renders the encounter pectoral muscle score value in the Pectoral muscle column', () => {
				render(
					<EncountersTable
						encounters={[makeEncounter(1, { pectoral_muscle: 3 })]}
					/>
				);
				expect(columnCellValue('Pectoral muscle', 'RING1')).toBe('3');
			});

			it('renders an empty cell when pectoral_muscle is null', () => {
				render(
					<EncountersTable
						encounters={[makeEncounter(1, { pectoral_muscle: null })]}
					/>
				);
				expect(columnCellValue('Pectoral muscle', 'RING1')).toBe('');
			});

			it('renders the encounter primary_moult raw value in the Primary moult column', () => {
				render(
					<EncountersTable
						encounters={[makeEncounter(1, { primary_moult: '5' })]}
					/>
				);
				expect(columnCellValue('Primary moult', 'RING1')).toBe('5');
			});

			it('renders an empty cell when primary_moult is null', () => {
				render(
					<EncountersTable
						encounters={[makeEncounter(1, { primary_moult: null })]}
					/>
				);
				expect(columnCellValue('Primary moult', 'RING1')).toBe('');
			});

			it('renders the encounter old_greater_coverts numeric value in the OGC column', () => {
				render(
					<EncountersTable
						encounters={[makeEncounter(1, { old_greater_coverts: 1 })]}
					/>
				);
				expect(columnCellValue('OGC', 'RING1')).toBe('1');
			});

			it('renders an empty cell when old_greater_coverts is null', () => {
				render(
					<EncountersTable
						encounters={[makeEncounter(1, { old_greater_coverts: null })]}
					/>
				);
				expect(columnCellValue('OGC', 'RING1')).toBe('');
			});
		});
	});

	describe('Edge', () => {
		it('renders header-only with no data rows when encounters is empty', () => {
			render(<EncountersTable encounters={[]} />);
			expect(headerLabels()).toEqual(STANDARD_COLUMNS);
			expect(bodyRows()).toHaveLength(0);
		});

		it('renders exactly one row when given a single encounter', () => {
			render(<EncountersTable encounters={[makeEncounter(1)]} />);
			expect(bodyRows()).toHaveLength(1);
		});

		it('renders correctly with every column shown together', () => {
			render(
				<EncountersTable
					encounters={encounters}
					showTimeColumn={true}
					showSpeciesColumn={true}
				/>
			);
			expect(headerLabels()).toEqual([
				'Time',
				'Ring No',
				'Species',
				'Type',
				'Age',
				'Proven Age',
				'Sex',
				'Sexing Method',
				'Breeding Condition',
				'Wing',
				'Weight',
				'Moult Code',
				'Fat',
				'Pectoral muscle',
				'Primary moult',
				'OGC'
			]);
			expect(bodyRows()).toHaveLength(encounters.length);
			// sorting still works with the full column set
			fireEvent.click(screen.getByText('Wing'));
			expect(bodyRows()[0].textContent).toContain('RING2');
		});

		it('renders identical Fat/Pectoral muscle/Primary moult/OGC values for the same encounter in both the net-rounds view and the expanded species-row view', () => {
			const encounter = makeEncounter(1, {
				fat: '2',
				pectoral_muscle: 3,
				primary_moult: '5',
				old_greater_coverts: 1
			});
			const scoreColumnValues = () =>
				['Fat', 'Pectoral muscle', 'Primary moult', 'OGC'].map((label) =>
					columnCellValue(label, 'RING1')
				);

			// Net-rounds view: size="responsive", no Time column, Species shown.
			const { unmount } = render(
				<EncountersTable
					encounters={[encounter]}
					size="responsive"
					showTimeColumn={false}
					showSpeciesColumn={true}
				/>
			);
			const netRoundsValues = scoreColumnValues();
			unmount();

			// Expanded species-row view: size="xs", Time shown, no Species column.
			render(
				<EncountersTable
					encounters={[encounter]}
					size="xs"
					showTimeColumn={true}
					showSpeciesColumn={false}
				/>
			);
			const speciesRowValues = scoreColumnValues();

			expect(speciesRowValues).toEqual(netRoundsValues);
			expect(speciesRowValues).toEqual(['2', '3', '5', '1']);
		});
	});
});
