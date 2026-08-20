import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SessionLinksList } from '../SessionLinksList';

afterEach(cleanup);

const sessionDates = ['2026-01-05', '2026-03-17'];

describe('SessionLinksList', () => {
	it('renders one link per session date', () => {
		render(
			<SessionLinksList sessionDates={sessionDates} viewedGroupId={1} />
		);
		expect(screen.getAllByRole('link')).toHaveLength(2);
	});

	it('links to /group/{viewedGroupId}/session-temp/{date} for each date', () => {
		render(
			<SessionLinksList sessionDates={sessionDates} viewedGroupId={7} />
		);
		const links = screen.getAllByRole('link');
		expect(links.map((link) => link.getAttribute('href'))).toEqual([
			'/group/7/session-temp/2026-01-05',
			'/group/7/session-temp/2026-03-17'
		]);
	});

	it('formats each link text as "EEE do MMMM yyyy"', () => {
		render(
			<SessionLinksList sessionDates={sessionDates} viewedGroupId={1} />
		);
		const links = screen.getAllByRole('link');
		expect(links.map((link) => link.textContent?.trim())).toEqual([
			'Mon 5th January 2026',
			'Tue 17th March 2026'
		]);
	});

	it('renders links in the order sessionDates is given', () => {
		render(
			<SessionLinksList
				sessionDates={['2026-03-17', '2026-01-05']}
				viewedGroupId={1}
			/>
		);
		const links = screen.getAllByRole('link');
		expect(links.map((link) => link.textContent?.trim())).toEqual([
			'Tue 17th March 2026',
			'Mon 5th January 2026'
		]);
	});

	it('renders nothing when sessionDates is empty', () => {
		const { container } = render(
			<SessionLinksList sessionDates={[]} viewedGroupId={1} />
		);
		expect(container.innerHTML).toBe('');
	});
});
