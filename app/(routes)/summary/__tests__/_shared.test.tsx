import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SummaryPage } from '../_shared';
import alphaStats from '@/test-fixtures/snapshots/fetchSummaryStats.alpha.json';
import type { AggregateStatsResult } from '@/app/models/db';

const populatedStats = alphaStats as unknown as AggregateStatsResult;

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

	describe('Structure', () => {
		it('renders the stats section above the session links list when both are present', () => {
			render(
				<SummaryPage
					summaryStats={populatedStats}
					sessionDates={['2026-01-05']}
					viewedGroup={{ id: 1, slug: 'alpha' }}
				/>
			);
			const statsSection = screen.getByTestId('summary-stats-section');
			const sessionLinksList = screen.getByRole('link');
			expect(
				statsSection.compareDocumentPosition(sessionLinksList) &
					Node.DOCUMENT_POSITION_FOLLOWING
			).toBeTruthy();
		});

		it('renders nothing extra when summaryStats is undefined/null', () => {
			render(<SummaryPage summaryStats={null} />);
			expect(screen.queryByTestId('summary-stats-section')).toBeNull();
		});
	});
});
