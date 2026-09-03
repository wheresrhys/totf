import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { EncountersTable } from '../EncountersTable';
import type { SessionEncounter } from '@/app/models/session';

function makeEncounter(
	id: number,
	overrides: {
		ring_no?: string;
		species?: string;
		capture_time?: string;
		wing_length?: number | null;
	} = {}
): SessionEncounter {
	return {
		id,
		session_id: 1,
		age_code: 4,
		is_juv: false,
		breeding_condition: null,
		capture_time: overrides.capture_time ?? '09:00:00',
		moult_code: null,
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
	'Moult Code'
];

const encounters: SessionEncounter[] = [
	makeEncounter(1, { ring_no: 'RING1', wing_length: 50 }),
	makeEncounter(2, { ring_no: 'RING2', wing_length: 90 }),
	makeEncounter(3, { ring_no: 'RING3', wing_length: 30 })
];

const headerLabels = () =>
	screen.getAllByRole('columnheader').map((header) => header.textContent);

const bodyRows = () => document.querySelectorAll('tbody tr');

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

		describe('sortable prop', () => {
			it('renders clickable, sortable headers when sortable (default)', () => {
				render(<EncountersTable encounters={encounters} />);
				screen.getAllByRole('columnheader').forEach((header) => {
					expect(header.className).toContain('cursor-pointer');
				});
				// default order: RING1 (50), RING2 (90), RING3 (30)
				fireEvent.click(screen.getByText('Wing'));
				expect(bodyRows()[0].textContent).toContain('RING2');
			});

			it('renders static, non-clickable headers when sortable is false', () => {
				render(<EncountersTable encounters={encounters} sortable={false} />);
				screen.getAllByRole('columnheader').forEach((header) => {
					expect(header.className).not.toContain('cursor-pointer');
				});
			});

			it('does not reorder rows on header click when sortable is false', () => {
				render(<EncountersTable encounters={encounters} sortable={false} />);
				const before = Array.from(bodyRows()).map((row) => row.textContent);
				fireEvent.click(screen.getByText('Wing'));
				const after = Array.from(bodyRows()).map((row) => row.textContent);
				expect(after).toEqual(before);
			});

			it('still renders one row per encounter with all columns when not sortable', () => {
				render(<EncountersTable encounters={encounters} sortable={false} />);
				expect(headerLabels()).toEqual(STANDARD_COLUMNS);
				expect(bodyRows()).toHaveLength(encounters.length);
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
				'Moult Code'
			]);
			expect(bodyRows()).toHaveLength(encounters.length);
			// sorting still works with the full column set
			fireEvent.click(screen.getByText('Wing'));
			expect(bodyRows()[0].textContent).toContain('RING2');
		});
	});
});
