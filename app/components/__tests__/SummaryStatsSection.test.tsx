import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SummaryStatsSection } from '../SummaryStatsSection';
import alphaStats from '@/test-fixtures/snapshots/core_stats/alpha.summary-totals.json';
import zeroStats from '@/test-fixtures/snapshots/synthetic/zero.summary-totals.json';
import type { CoreStatsResult } from '@/app/models/db';

const populatedStats = alphaStats as unknown as CoreStatsResult;
const zeroActivityStats = zeroStats as unknown as CoreStatsResult;

afterEach(() => {
	cleanup();
});

describe('SummaryStatsSection', () => {
	describe('Usual', () => {
		it('renders all twelve stat labels with their values from a populated row', () => {
			render(<SummaryStatsSection stats={populatedStats} />);
			expect(screen.getByText('Sessions').nextSibling?.textContent).toBe(
				String(populatedStats.session_count)
			);
			expect(screen.getByText('Species').nextSibling?.textContent).toBe(
				String(populatedStats.species_count)
			);
			expect(screen.getByText('Encounters').nextSibling?.textContent).toBe(
				String(populatedStats.encounter_count)
			);
			expect(screen.getByText('Individuals').nextSibling?.textContent).toBe(
				String(populatedStats.bird_count)
			);
			expect(screen.getByText('New').nextSibling?.textContent).toBe(
				String(populatedStats.new_bird_count)
			);
			expect(screen.getByText('Retraps').nextSibling?.textContent).toBe(
				String(populatedStats.bird_count - populatedStats.new_bird_count)
			);
			expect(screen.getByText('Pulli').nextSibling?.textContent).toBe(
				String(populatedStats.pullus_bird_count)
			);
			expect(screen.getByText('Adults').nextSibling?.textContent).toBe(
				String(populatedStats.adult_bird_count)
			);
			expect(screen.getByText('Juvs').nextSibling?.textContent).toBe(
				String(populatedStats.juv_bird_count)
			);
			expect(screen.getByText('Postjuvs').nextSibling?.textContent).toBe(
				String(populatedStats.postjuv_bird_count)
			);
			expect(screen.getByText('Not aged').nextSibling?.textContent).toBe(
				String(populatedStats.unknown_age_bird_count)
			);
		});

		it('computes Retraps as bird_count - new_bird_count', () => {
			// populatedStats' own bird_count/new_bird_count happen to be equal
			// (real Alpha seed data has no retraps yet, #894), which wouldn't
			// exercise the subtraction meaningfully — this asserts it against a
			// row with a genuine gap between the two instead.
			const statsWithRetraps: CoreStatsResult = {
				...populatedStats,
				bird_count: 60,
				new_bird_count: 40
			};
			render(<SummaryStatsSection stats={statsWithRetraps} />);
			expect(screen.getByText('Retraps').nextSibling?.textContent).toBe('20');
		});
	});

	describe('Structure', () => {
		it('renders nothing when stats is null', () => {
			const { container } = render(<SummaryStatsSection stats={null} />);
			expect(container.innerHTML).toBe('');
		});

		it('renders rows in the same order as SpeciesTotalsTable columns', () => {
			render(<SummaryStatsSection stats={populatedStats} />);
			const rowHeaders = screen
				.getAllByRole('rowheader')
				.map((element) => element.textContent);
			expect(rowHeaders).toEqual([
				'Sessions',
				'Species',
				'Encounters',
				'Individuals',
				'New',
				'Retraps',
				'Pulli',
				'Juvs',
				'Postjuvs',
				'Adults',
				'Not aged'
			]);
		});
	});

	describe('Edge', () => {
		it('renders 0 for every stat, including Retraps and Effort, in a zero-activity period', () => {
			render(<SummaryStatsSection stats={zeroActivityStats} />);
			expect(screen.getByText('Sessions').nextSibling?.textContent).toBe('0');
			expect(screen.getByText('Species').nextSibling?.textContent).toBe('0');
			expect(screen.getByText('Encounters').nextSibling?.textContent).toBe('0');
			expect(screen.getByText('Individuals').nextSibling?.textContent).toBe(
				'0'
			);
			expect(screen.getByText('New').nextSibling?.textContent).toBe('0');
			expect(screen.getByText('Retraps').nextSibling?.textContent).toBe('0');
			expect(screen.getByText('Pulli').nextSibling?.textContent).toBe('0');
			expect(screen.getByText('Adults').nextSibling?.textContent).toBe('0');
			expect(screen.getByText('Juvs').nextSibling?.textContent).toBe('0');
			expect(screen.getByText('Postjuvs').nextSibling?.textContent).toBe('0');
			expect(screen.getByText('Not aged').nextSibling?.textContent).toBe('0');
		});

		it('renders Retraps as 0 when every bird in the period is new (new_bird_count === bird_count)', () => {
			const allNewStats: CoreStatsResult = {
				...populatedStats,
				bird_count: 40,
				new_bird_count: 40
			};
			render(<SummaryStatsSection stats={allNewStats} />);
			expect(screen.getByText('Retraps').nextSibling?.textContent).toBe('0');
		});

		it('renders Retraps equal to bird_count when new_bird_count is 0 (no new birds)', () => {
			const noNewStats: CoreStatsResult = {
				...populatedStats,
				bird_count: 60,
				new_bird_count: 0
			};
			render(<SummaryStatsSection stats={noNewStats} />);
			expect(screen.getByText('Retraps').nextSibling?.textContent).toBe('60');
		});
	});
});
