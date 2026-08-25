import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SummaryStatsSection } from '../SummaryStatsSection';
import alphaStats from '@/test-fixtures/snapshots/fetchSummaryStats.alpha.json';
import zeroStats from '@/test-fixtures/snapshots/fetchSummaryStats.zero.json';
import type { AggregateStatsResult } from '@/app/models/db';

const populatedStats = alphaStats as unknown as AggregateStatsResult;
const zeroActivityStats = zeroStats as unknown as AggregateStatsResult;

afterEach(() => {
	cleanup();
});

describe('SummaryStatsSection', () => {
	describe('Usual', () => {
		it('renders all thirteen stat labels with their values from a populated row', () => {
			render(<SummaryStatsSection stats={populatedStats} />);
			expect(screen.getByText('Sessions').nextSibling?.textContent).toBe('10');
			expect(screen.getByText('Effort').nextSibling?.textContent).toBe('20h');
			expect(screen.getByText('Species').nextSibling?.textContent).toBe('8');
			expect(screen.getByText('Encounters').nextSibling?.textContent).toBe(
				'70'
			);
			expect(screen.getByText('Individuals').nextSibling?.textContent).toBe(
				'60'
			);
			expect(screen.getByText('New').nextSibling?.textContent).toBe('40');
			expect(screen.getByText('Retraps').nextSibling?.textContent).toBe('20');
			expect(screen.getByText('Pullus').nextSibling?.textContent).toBe('10');
			expect(screen.getByText('Adults').nextSibling?.textContent).toBe('22');
			expect(screen.getByText('Juvs').nextSibling?.textContent).toBe('15');
			expect(screen.getByText('Postjuv').nextSibling?.textContent).toBe('8');
			expect(screen.getByText('Unknown age').nextSibling?.textContent).toBe(
				'5'
			);
			expect(screen.getByText('New young').nextSibling?.textContent).toBe('12');
		});

		it('formats total_effort via formatPostgresIntervalForDisplay rather than the raw interval string', () => {
			render(<SummaryStatsSection stats={populatedStats} />);
			expect(screen.queryByText('20:00:00')).toBeNull();
			expect(screen.getByText('Effort').nextSibling?.textContent).toBe('20h');
		});

		it('computes Retraps as bird_count - new_bird_count', () => {
			render(<SummaryStatsSection stats={populatedStats} />);
			expect(screen.getByText('Retraps').nextSibling?.textContent).toBe('20');
		});
	});

	describe('Structure', () => {
		it('renders nothing when stats is null', () => {
			const { container } = render(<SummaryStatsSection stats={null} />);
			expect(container.innerHTML).toBe('');
		});
	});

	describe('Edge', () => {
		it('renders 0 for every stat, including Retraps and Effort, in a zero-activity period', () => {
			render(<SummaryStatsSection stats={zeroActivityStats} />);
			expect(screen.getByText('Sessions').nextSibling?.textContent).toBe('0');
			expect(screen.getByText('Effort').nextSibling?.textContent).toBe('0');
			expect(screen.getByText('Species').nextSibling?.textContent).toBe('0');
			expect(screen.getByText('Encounters').nextSibling?.textContent).toBe('0');
			expect(screen.getByText('Individuals').nextSibling?.textContent).toBe(
				'0'
			);
			expect(screen.getByText('New').nextSibling?.textContent).toBe('0');
			expect(screen.getByText('Retraps').nextSibling?.textContent).toBe('0');
			expect(screen.getByText('Pullus').nextSibling?.textContent).toBe('0');
			expect(screen.getByText('Adults').nextSibling?.textContent).toBe('0');
			expect(screen.getByText('Juvs').nextSibling?.textContent).toBe('0');
			expect(screen.getByText('Postjuv').nextSibling?.textContent).toBe('0');
			expect(screen.getByText('Unknown age').nextSibling?.textContent).toBe(
				'0'
			);
			expect(screen.getByText('New young').nextSibling?.textContent).toBe('0');
		});

		it('renders Retraps as 0 when every bird in the period is new (new_bird_count === bird_count)', () => {
			const allNewStats: AggregateStatsResult = {
				...populatedStats,
				bird_count: 40,
				new_bird_count: 40
			};
			render(<SummaryStatsSection stats={allNewStats} />);
			expect(screen.getByText('Retraps').nextSibling?.textContent).toBe('0');
		});

		it('renders Retraps equal to bird_count when new_bird_count is 0 (no new birds)', () => {
			const noNewStats: AggregateStatsResult = {
				...populatedStats,
				bird_count: 60,
				new_bird_count: 0
			};
			render(<SummaryStatsSection stats={noNewStats} />);
			expect(screen.getByText('Retraps').nextSibling?.textContent).toBe('60');
		});
	});
});
