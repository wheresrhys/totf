import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SummaryPage } from '../_shared';
import alphaStats from '@/test-fixtures/snapshots/fetchSummaryStats.alpha.json';
import alphaSpeciesStats from '@/test-fixtures/snapshots/fetchSpeciesData.alpha.json';
import type { AggregateStatsResult } from '@/app/models/db';

const populatedStats = alphaStats as unknown as AggregateStatsResult;
const populatedSpeciesStats =
	alphaSpeciesStats as unknown as AggregateStatsResult[];

describe('SummaryPage', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders "All time summary" when neither year nor month is given', async () => {
		render(<SummaryPage />);
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('All time summary');
	});

	it('renders "{year} summary" when only year is given', async () => {
		render(<SummaryPage year={2026} />);
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('2026 summary');
	});

	it('renders "{long month} {year} summary" when both year and month are given', async () => {
		render(<SummaryPage year={2026} month={8} />);
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('August 2026 summary');
	});

	it('renders the youngest-age-category note immediately after the heading on the all-time page', async () => {
		render(<SummaryPage />);
		const heading = await screen.findByRole('heading', { level: 1 });
		const note = screen.getByText(
			'Note that birds are counted in the youngest age category they were recorded in'
		);
		expect(heading.nextElementSibling).toBe(note);
	});

	describe('Structure', () => {
		it('renders nothing extra when summaryStats is undefined/null', () => {
			render(<SummaryPage summaryStats={null} />);
			expect(screen.queryByTestId('summary-stats-section')).toBeNull();
		});

		it('does not render the youngest-age-category note when year is given', () => {
			render(<SummaryPage year={2026} />);
			expect(
				screen.queryByText(
					'Note that birds are counted in the youngest age category they were recorded in'
				)
			).toBeNull();
		});

		it('does not render the youngest-age-category note when year and month are given', () => {
			render(<SummaryPage year={2026} month={8} />);
			expect(
				screen.queryByText(
					'Note that birds are counted in the youngest age category they were recorded in'
				)
			).toBeNull();
		});
	});

	describe('Edge', () => {
		it('renders no session links list even with populated stats/species', () => {
			render(
				<SummaryPage
					summaryStats={populatedStats}
					speciesStats={populatedSpeciesStats}
				/>
			);
			expect(screen.queryByRole('link')).toBeNull();
		});
	});
});
