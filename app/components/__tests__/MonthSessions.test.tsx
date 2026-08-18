import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MonthSessionsContent } from '../MonthSessions';
import type { SessionWithEncountersCount } from '@/app/models/session';

const monthData: SessionWithEncountersCount[] = [
	{
		id: 1,
		visit_date: '2024-05-10',
		location: { id: 2, location_name: 'Test Reserve' },
		encounters: [{ count: 5 }]
	}
] as unknown as SessionWithEncountersCount[];

afterEach(() => {
	cleanup();
});

describe('MonthSessionsContent', () => {
	it('forwards viewedGroup to SessionsByDay so its rendered link uses the slug', () => {
		render(
			<MonthSessionsContent
				model={{
					viewedGroup: { id: 1, slug: 'alpha' },
					monthData
				}}
			/>
		);
		const link = screen.getByRole('link');
		expect(link.getAttribute('href')).toBe('/group/alpha/session/2024-05-10');
	});
});
