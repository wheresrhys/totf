import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import GlobalNav, { DesktopNavItems, MobileNavItems } from '../GlobalNav';
import type { RingingGroupRow } from '@/app/models/db';

const noOp = () => {};

const mockGroups = [{ id: 1, group_name: 'Alpha' }] as RingingGroupRow[];

describe('DesktopNavItems', () => {
	afterEach(cleanup);

	it('renders Sessions link at top level', () => {
		render(
			<DesktopNavItems classes="" moreExpanded={false} onMoreClick={noOp} />
		);
		expect(screen.getByRole('link', { name: 'Sessions' })).toBeDefined();
	});

	it('renders Species link at top level', () => {
		render(
			<DesktopNavItems classes="" moreExpanded={false} onMoreClick={noOp} />
		);
		expect(screen.getByRole('link', { name: 'Species' })).toBeDefined();
	});

	it('renders a More button', () => {
		render(
			<DesktopNavItems classes="" moreExpanded={false} onMoreClick={noOp} />
		);
		expect(screen.getByRole('button', { name: /more/i })).toBeDefined();
	});

	it('More dropdown shows when moreExpanded is true', () => {
		render(
			<DesktopNavItems classes="" moreExpanded={true} onMoreClick={noOp} />
		);
		expect(screen.getByRole('link', { name: 'Mistakes' })).toBeDefined();
		expect(screen.getByRole('link', { name: 'Retraps' })).toBeDefined();
		expect(screen.getByRole('link', { name: 'Resightings' })).toBeDefined();
		expect(screen.getByRole('link', { name: 'Pulli' })).toBeDefined();
		expect(screen.getByRole('link', { name: 'Ticks' })).toBeDefined();
		expect(screen.getByRole('link', { name: 'Effort' })).toBeDefined();
		expect(screen.getByRole('link', { name: 'Ring Sequences' })).toBeDefined();
		expect(screen.getByRole('link', { name: 'Controls' })).toBeDefined();
	});

	it('More dropdown is hidden when moreExpanded is false', () => {
		render(
			<DesktopNavItems classes="" moreExpanded={false} onMoreClick={noOp} />
		);
		expect(screen.queryByRole('link', { name: 'Mistakes' })).toBeNull();
	});

	it('Ring Sequences link points to /ring-sequences', () => {
		render(
			<DesktopNavItems classes="" moreExpanded={true} onMoreClick={noOp} />
		);
		const link = screen.getByRole('link', { name: 'Ring Sequences' });
		expect(link.getAttribute('href')).toBe('/ring-sequences');
	});

	it('calls onMoreClick when More button is clicked', () => {
		const onMoreClick = vi.fn();
		render(
			<DesktopNavItems
				classes=""
				moreExpanded={false}
				onMoreClick={onMoreClick}
			/>
		);
		fireEvent.click(screen.getByRole('button', { name: /more/i }));
		expect(onMoreClick).toHaveBeenCalledOnce();
	});
});

describe('MobileNavItems', () => {
	afterEach(cleanup);

	it('renders all 10 links in a flat list', () => {
		render(<MobileNavItems classes="" />);
		const links = screen.getAllByRole('link');
		expect(links).toHaveLength(10);
	});

	it('includes Resightings link', () => {
		render(<MobileNavItems classes="" />);
		expect(screen.getByRole('link', { name: 'Resightings' })).toBeDefined();
	});

	it('includes Pulli link', () => {
		render(<MobileNavItems classes="" />);
		expect(screen.getByRole('link', { name: 'Pulli' })).toBeDefined();
	});

	it('includes Ticks link', () => {
		render(<MobileNavItems classes="" />);
		expect(screen.getByRole('link', { name: 'Ticks' })).toBeDefined();
	});

	it('includes Sessions link', () => {
		render(<MobileNavItems classes="" />);
		expect(screen.getByRole('link', { name: 'Sessions' })).toBeDefined();
	});

	it('includes Species link', () => {
		render(<MobileNavItems classes="" />);
		expect(screen.getByRole('link', { name: 'Species' })).toBeDefined();
	});

	it('includes Ring Sequences link', () => {
		render(<MobileNavItems classes="" />);
		expect(screen.getByRole('link', { name: 'Ring Sequences' })).toBeDefined();
	});

	it('includes Controls link', () => {
		render(<MobileNavItems classes="" />);
		expect(screen.getByRole('link', { name: 'Controls' })).toBeDefined();
	});
});

describe('GlobalNav', () => {
	afterEach(cleanup);

	it('shows the branding and the selected group name regardless of readOnly', () => {
		render(<GlobalNav groups={mockGroups} selectedGroupId={1} readOnly />);
		expect(screen.getByText('Top of the Flocks')).toBeDefined();
		expect(screen.getByText('Alpha')).toBeDefined();
	});

	describe('default (logged-in) view', () => {
		it('renders the Sessions/Species nav links', () => {
			render(<GlobalNav groups={mockGroups} selectedGroupId={1} />);
			// Rendered twice — once in the desktop nav, once in the (hidden by
			// default) mobile nav Expander.
			expect(screen.getAllByRole('link', { name: 'Sessions' }).length).toBe(2);
		});

		it('renders a "Toggle user menu" button', () => {
			render(<GlobalNav groups={mockGroups} selectedGroupId={1} />);
			expect(
				screen.getByRole('button', { name: 'Toggle user menu' })
			).toBeDefined();
		});

		it('renders "Import data" and "Log out" once the user menu is expanded', () => {
			render(<GlobalNav groups={mockGroups} selectedGroupId={1} />);
			fireEvent.click(screen.getByRole('button', { name: 'Toggle user menu' }));
			expect(screen.getByRole('link', { name: 'Import data' })).toBeDefined();
			expect(screen.getByRole('button', { name: 'Log out' })).toBeDefined();
		});

		it('renders a ring-number search toggle', () => {
			render(<GlobalNav groups={mockGroups} selectedGroupId={1} />);
			expect(
				screen.getByRole('button', { name: 'Search for a ring number' })
			).toBeDefined();
		});
	});

	describe('readOnly (anonymous public-summary view)', () => {
		it('does not render the Sessions/Species nav links', () => {
			render(<GlobalNav groups={mockGroups} selectedGroupId={1} readOnly />);
			expect(screen.queryByRole('link', { name: 'Sessions' })).toBeNull();
		});

		it('does not render a "Toggle user menu" button', () => {
			render(<GlobalNav groups={mockGroups} selectedGroupId={1} readOnly />);
			expect(
				screen.queryByRole('button', { name: 'Toggle user menu' })
			).toBeNull();
		});

		it('does not render "Import data" or "Log out"', () => {
			render(<GlobalNav groups={mockGroups} selectedGroupId={1} readOnly />);
			expect(screen.queryByRole('link', { name: 'Import data' })).toBeNull();
			expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
		});

		it('does not render a ring-number search toggle', () => {
			render(<GlobalNav groups={mockGroups} selectedGroupId={1} readOnly />);
			expect(
				screen.queryByRole('button', { name: 'Search for a ring number' })
			).toBeNull();
		});
	});
});
