import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	waitFor,
	fireEvent
} from '@testing-library/react';
import { StatsAccordionItem } from '../StatsAccordionItem';
import topPeriodsSnapshot from '@/test-fixtures/snapshots/getTopPeriodsByMetric.alpha.json';
import type { TopPeriodsResult } from '@/app/models/db';
import type { AccordionItemModel } from '../StatsAccordion';
import type { UserTopStatsArgs } from '@/app/actions/top-performers';

vi.mock('@/app/actions/top-performers', () => ({
	getTopStats: vi.fn()
}));

const mockItemModel: AccordionItemModel = {
	definition: {
		id: 'test-metric',
		category: 'Top sessions',
		unit: 'birds',
		dataArguments: {
			metric_name: 'encounter_count',
			temporal_unit: 'day',
			filters: {
				month_filter: null,
				year_filter: null,
				exact_months_filter: null,
				months_filter: null,
				species_filter: null
			}
		} as unknown as UserTopStatsArgs
	},
	data: topPeriodsSnapshot as TopPeriodsResult[]
};

const mockOnToggle = vi.fn();

describe('StatsAccordionItem', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	beforeEach(async () => {
		const { getTopStats } = await import('@/app/actions/top-performers');
		vi.mocked(getTopStats).mockResolvedValue(
			topPeriodsSnapshot as TopPeriodsResult[]
		);
	});

	it('renders heading with initial data', () => {
		render(
			<StatsAccordionItem
				item={mockItemModel}
				viewedGroupId={1}
				expanded={false}
				onToggle={mockOnToggle}
			/>
		);
		const button = screen.getByRole('button');
		expect(button.textContent).toContain('Top sessions:');
		expect(button.textContent).toContain('11 birds');
	});

	it('shows "No data available" in heading when no initial data', () => {
		const emptyItem: AccordionItemModel = {
			...mockItemModel,
			data: []
		};
		render(
			<StatsAccordionItem
				item={emptyItem}
				viewedGroupId={1}
				expanded={false}
				onToggle={mockOnToggle}
			/>
		);
		const button = screen.getByRole('button');
		expect(button.textContent).toContain('No data available');
	});

	it('calls onToggle when button is clicked', () => {
		render(
			<StatsAccordionItem
				item={mockItemModel}
				viewedGroupId={1}
				expanded={false}
				onToggle={mockOnToggle}
			/>
		);
		fireEvent.click(screen.getByRole('button'));
		expect(mockOnToggle).toHaveBeenCalledWith('test-metric');
	});

	it('loads data via getTopStats when expanded', async () => {
		const { getTopStats } = await import('@/app/actions/top-performers');
		const itemWithNoData: AccordionItemModel = {
			...mockItemModel,
			data: []
		};
		render(
			<StatsAccordionItem
				item={itemWithNoData}
				viewedGroupId={1}
				expanded="test-metric"
				onToggle={mockOnToggle}
			/>
		);
		await waitFor(() => {
			expect(vi.mocked(getTopStats)).toHaveBeenCalled();
		});
	});
});
