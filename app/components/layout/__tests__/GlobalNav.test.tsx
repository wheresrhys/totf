import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DesktopNavItems, MobileNavItems } from '../GlobalNav';

describe('DesktopNavItems', () => {
	afterEach(cleanup);

	it('renders Sessions link at top level', () => {
		render(<DesktopNavItems classes="" />);
		expect(screen.getByRole('link', { name: 'Sessions' })).toBeDefined();
	});

	it('renders Species link at top level', () => {
		render(<DesktopNavItems classes="" />);
		expect(screen.getByRole('link', { name: 'Species' })).toBeDefined();
	});

	it('renders a More button', () => {
		render(<DesktopNavItems classes="" />);
		expect(screen.getByRole('button', { name: /more/i })).toBeDefined();
	});

	it('More dropdown contains Mistakes link', () => {
		render(<DesktopNavItems classes="" />);
		expect(screen.getByRole('link', { name: 'Mistakes' })).toBeDefined();
	});

	it('More dropdown contains Retraps link', () => {
		render(<DesktopNavItems classes="" />);
		expect(screen.getByRole('link', { name: 'Retraps' })).toBeDefined();
	});

	it('More dropdown contains Effort link', () => {
		render(<DesktopNavItems classes="" />);
		expect(screen.getByRole('link', { name: 'Effort' })).toBeDefined();
	});

	it('More dropdown contains Ring Sequences link', () => {
		render(<DesktopNavItems classes="" />);
		expect(screen.getByRole('link', { name: 'Ring Sequences' })).toBeDefined();
	});

	it('Ring Sequences link points to /ring-sequences', () => {
		render(<DesktopNavItems classes="" />);
		const link = screen.getByRole('link', { name: 'Ring Sequences' });
		expect(link.getAttribute('href')).toBe('/ring-sequences');
	});
});

describe('MobileNavItems', () => {
	afterEach(cleanup);

	it('renders all 6 links in a flat list', () => {
		render(<MobileNavItems classes="" />);
		const links = screen.getAllByRole('link');
		expect(links).toHaveLength(6);
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
});
