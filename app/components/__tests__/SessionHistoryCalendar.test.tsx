import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SessionsByDay } from '../SessionHistoryCalendar';
import type { SessionWithEncountersCount } from '@/app/models/session';

const viewedGroup = { id: 1, slug: 'alpha' };

afterEach(() => {
	cleanup();
});

describe('SessionsByDay', () => {
	describe('a single-session day', () => {
		it('renders a StatOutput link to /group/<slug>/session/<date>', () => {
			const sessions: SessionWithEncountersCount[] = [
				{
					id: 1,
					visit_date: '2024-05-10',
					location: { id: 2, location_name: 'Test Reserve' },
					encounters: [{ count: 5 }]
				}
			] as unknown as SessionWithEncountersCount[];
			render(
				<ol>
					<SessionsByDay
						sessions={sessions}
						viewedGroup={viewedGroup}
						dateFormat="EEEE do MMMM"
					/>
				</ol>
			);
			const link = screen.getByRole('link');
			expect(link.getAttribute('href')).toBe('/group/alpha/session/2024-05-10');
		});
	});

	describe('a multi-session day', () => {
		it('renders one link per location, each to /group/<slug>/session/<date>/site/<locationId>', () => {
			const sessions: SessionWithEncountersCount[] = [
				{
					id: 1,
					visit_date: '2024-05-10',
					location: { id: 2, location_name: 'Test Reserve' },
					encounters: [{ count: 5 }]
				},
				{
					id: 2,
					visit_date: '2024-05-10',
					location: { id: 3, location_name: 'Other Reserve' },
					encounters: [{ count: 2 }]
				}
			] as unknown as SessionWithEncountersCount[];
			render(
				<ol>
					<SessionsByDay
						sessions={sessions}
						viewedGroup={viewedGroup}
						dateFormat="EEEE do MMMM"
					/>
				</ol>
			);
			const locationLinks = screen.getAllByRole('link', {
				name: /Reserve/
			});
			expect(locationLinks).toHaveLength(2);
			expect(locationLinks[0].getAttribute('href')).toBe(
				'/group/alpha/session/2024-05-10/site/2'
			);
			expect(locationLinks[1].getAttribute('href')).toBe(
				'/group/alpha/session/2024-05-10/site/3'
			);
		});
	});
});
