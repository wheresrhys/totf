import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DesktopNavItems, MobileNavItems } from '../GlobalNav';

const noOp = () => {};

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

	it('renders all 7 links in a flat list', () => {
		render(<MobileNavItems classes="" />);
		const links = screen.getAllByRole('link');
		expect(links).toHaveLength(7);
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
