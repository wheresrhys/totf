import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SpeciesTotalsSection } from '../SpeciesTotalsSection';
import speciesDataSnapshot from '@/test-fixtures/snapshots/fetchSpeciesData.alpha.json';
import type { AggregateStatsResult } from '@/app/models/db';

const speciesStats = speciesDataSnapshot as unknown as AggregateStatsResult[];

describe('SpeciesTotalsSection', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders a single "Species totals" tab, active by default, with the table content visible beneath it', () => {
		render(<SpeciesTotalsSection speciesStats={speciesStats} />);
		const tab = screen.getByRole('button', { name: 'Species totals' });
		expect(tab.getAttribute('aria-current')).toBe('true');
		expect(document.querySelectorAll('tbody tr').length).toBe(
			speciesStats.length
		);
	});

	it("renders the table's empty state when speciesStats is empty, without crashing", () => {
		render(<SpeciesTotalsSection speciesStats={[]} />);
		expect(screen.getByRole('button', { name: 'Species totals' })).toBeTruthy();
		expect(document.querySelectorAll('tbody tr').length).toBe(0);
	});
});
