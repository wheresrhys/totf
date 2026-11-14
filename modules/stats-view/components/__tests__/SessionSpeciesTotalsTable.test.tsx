import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SessionSpeciesTotalsTable } from '../SessionSpeciesTotalsTable';
import { SessionMistNettingTab } from '@/app/components/pages/session/SessionMistNettingTab';
import { SessionOtherCatchesTab } from '@/app/components/pages/session/SessionOtherCatchesTab';
import type { SessionTabParams } from '@/app/components/pages/session/session-tab-config';
import type {
	SessionEncounter,
	SpeciesWithEncounters
} from '@/app/models/session';
import { getCellTextByHeading } from '@/app/__tests__/helpers/table';

const AGE_BUCKET_HEADINGS = [
	'New',
	'Retrap',
	'Juv',
	'Postjuv',
	'Adult',
	'Not aged'
];

const BIOMETRIC_HEADINGS = [
	'Max weight (g)',
	'Avg weight (g)',
	'Median weight (g)',
	'Min weight (g)',
	'Max wing (mm)',
	'Avg wing (mm)',
	'Median wing (mm)',
	'Min wing (mm)'
];

function makeEncounter(
	ringNumber: string,
	measurements: { weight?: number | null; wing_length?: number | null } = {}
): SessionEncounter {
	return {
		record_type: 'N',
		age_code: 4,
		is_juv: false,
		weight: measurements.weight ?? null,
		wing_length: measurements.wing_length ?? null,
		bird: { ring_no: ringNumber, proven_age: 2 }
	} as SessionEncounter;
}

// Robin: weights 18/16 (max 18, avg 17, min 16, median 17), wings 70/72.
// Wren: nothing measured at all, so every biometric cell is blank.
// Session-wide across both species: weights 18/16/10 and wings 70/72.
const robin: SpeciesWithEncounters = {
	species: 'Robin',
	encounters: [
		makeEncounter('R1', { weight: 18, wing_length: 70 }),
		makeEncounter('R2', { weight: 16, wing_length: 72 })
	]
};
const unmeasuredWren: SpeciesWithEncounters = {
	species: 'Wren',
	encounters: [makeEncounter('W1')]
};
const lightGoldcrest: SpeciesWithEncounters = {
	species: 'Goldcrest',
	encounters: [makeEncounter('G1', { weight: 10 })]
};

const speciesList = [robin, unmeasuredWren, lightGoldcrest];

function renderTable(list: SpeciesWithEncounters[] = speciesList) {
	return render(
		<SessionSpeciesTotalsTable speciesList={list} testId="session-table" />
	);
}

function showBiometrics() {
	fireEvent.click(screen.getByRole('radio', { name: 'Biometrics' }));
}

function columnHeadings(): string[] {
	return Array.from(document.querySelectorAll('thead th')).map(
		(header) => header.textContent?.trim() ?? ''
	);
}

function sessionTabParams(): SessionTabParams {
	return {
		date: '2024-09-15',
		mistNetSpeciesList: speciesList,
		otherCatchesSpeciesList: speciesList,
		netRounds: [],
		oldestEncounter: null,
		canReportHighlights: false
	};
}

describe('SessionSpeciesTotalsTable', () => {
	afterEach(() => {
		cleanup();
	});

	describe('counts mode (default)', () => {
		it('renders the existing age-bucket breakdown columns and Max Proven Age', () => {
			renderTable();
			expect(columnHeadings()).toEqual([
				'Species',
				'Total',
				...AGE_BUCKET_HEADINGS,
				'Max Proven Age'
			]);
		});

		it('does not render any biometric columns', () => {
			renderTable();
			BIOMETRIC_HEADINGS.forEach((heading) => {
				expect(columnHeadings()).not.toContain(heading);
			});
		});
	});

	describe('toggling to biometrics mode', () => {
		it('renders the 8 biometric columns in place of the age-bucket breakdown', () => {
			renderTable();
			showBiometrics();
			expect(columnHeadings()).toEqual([
				'Species',
				'Total',
				...BIOMETRIC_HEADINGS
			]);
		});

		it('hides the Max Proven Age column', () => {
			renderTable();
			showBiometrics();
			expect(columnHeadings()).not.toContain('Max Proven Age');
		});

		it('still renders the Species and Total columns', () => {
			renderTable();
			showBiometrics();
			expect(getCellTextByHeading('Species', 'Robin')).toBe('Robin');
			expect(getCellTextByHeading('Total', 'Robin')).toBe('2');
		});
	});

	describe('biometrics mode data', () => {
		it('shows blank/null weight and wing stats for a species whose encounters have no weight or wing_length recorded', () => {
			renderTable();
			showBiometrics();
			BIOMETRIC_HEADINGS.forEach((heading) => {
				expect(getCellTextByHeading(heading, 'Wren')).toBe('—');
			});
		});

		it('shows the computed max/avg/min/median weight and wing values for a species with measured encounters', () => {
			renderTable();
			showBiometrics();
			expect(getCellTextByHeading('Max weight (g)', 'Robin')).toBe('18');
			expect(getCellTextByHeading('Avg weight (g)', 'Robin')).toBe('17');
			expect(getCellTextByHeading('Min weight (g)', 'Robin')).toBe('16');
			expect(getCellTextByHeading('Median weight (g)', 'Robin')).toBe('17');
			expect(getCellTextByHeading('Max wing (mm)', 'Robin')).toBe('72');
			expect(getCellTextByHeading('Avg wing (mm)', 'Robin')).toBe('71');
			expect(getCellTextByHeading('Min wing (mm)', 'Robin')).toBe('70');
			expect(getCellTextByHeading('Median wing (mm)', 'Robin')).toBe('71');
		});
	});

	describe('totals row in biometrics mode', () => {
		it("shows the session-wide max/avg/min/median computed across every species' encounters, not a sum of the per-species values", () => {
			renderTable();
			showBiometrics();
			const totalsRow = screen.getByTestId('totals-row');
			// Weights across all three species: 18, 16, 10 — so avg 14.7 (not the
			// 27 a sum of the per-species averages would give) and median 16.
			expect(getCellTextByHeading('Max weight (g)', totalsRow)).toBe('18');
			expect(getCellTextByHeading('Avg weight (g)', totalsRow)).toBe('14.7');
			expect(getCellTextByHeading('Min weight (g)', totalsRow)).toBe('10');
			expect(getCellTextByHeading('Median weight (g)', totalsRow)).toBe('16');
			// Only Robin was wing-measured, so the session-wide wing stats are hers.
			expect(getCellTextByHeading('Max wing (mm)', totalsRow)).toBe('72');
			expect(getCellTextByHeading('Avg wing (mm)', totalsRow)).toBe('71');
			expect(getCellTextByHeading('Min wing (mm)', totalsRow)).toBe('70');
			expect(getCellTextByHeading('Median wing (mm)', totalsRow)).toBe('71');
		});

		it('keeps summing the counts columns and overriding Max Proven Age in counts mode', () => {
			renderTable();
			const totalsRow = screen.getByTestId('totals-row');
			expect(getCellTextByHeading('Total', totalsRow)).toBe('4');
			expect(getCellTextByHeading('Max Proven Age', totalsRow)).toBe('2');
		});
	});

	describe('rendered by both session tabs', () => {
		it('renders the toggle when used from the Mist-netting tab', () => {
			render(<SessionMistNettingTab params={sessionTabParams()} />);
			expect(screen.getByRole('radio', { name: 'Biometrics' })).toBeInstanceOf(
				HTMLInputElement
			);
		});

		it('renders the toggle when used from the Other-catches tab', () => {
			render(<SessionOtherCatchesTab params={sessionTabParams()} />);
			expect(screen.getByRole('radio', { name: 'Biometrics' })).toBeInstanceOf(
				HTMLInputElement
			);
		});
	});
});
