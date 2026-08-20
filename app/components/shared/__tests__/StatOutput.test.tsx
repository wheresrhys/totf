import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StatOutput } from '../StatOutput';
import type { LocationRow } from '@/app/models/db';

afterEach(() => {
	cleanup();
});

describe('StatOutput', () => {
	describe('day temporal unit href', () => {
		// This ticket (#490) flips the session href from viewedGroup.id to
		// viewedGroup.slug, now that the /group/[groupSlug] route accepts slugs.
		it('builds the session href from viewedGroup.slug', () => {
			render(
				<StatOutput
					value={11}
					visitDate="2022-10-20"
					temporalUnit="day"
					viewedGroup={{ id: 1, slug: 'alpha' }}
				/>
			);
			const link = screen.getByRole('link') as HTMLAnchorElement;
			expect(link.getAttribute('href')).toBe('/group/alpha/session/2022-10-20');
		});

		it('appends the site segment from location.id when a location is given', () => {
			const location = {
				id: 31,
				location_name: 'Alpha Site B'
			} as LocationRow;
			render(
				<StatOutput
					value={5}
					visitDate="2022-10-20"
					temporalUnit="day"
					location={location}
					viewedGroup={{ id: 1, slug: 'alpha' }}
				/>
			);
			const link = screen.getByRole('link') as HTMLAnchorElement;
			expect(link.getAttribute('href')).toBe(
				'/group/alpha/session/2022-10-20/site/31'
			);
		});

		it('throws when viewedGroup is missing for a day temporal unit', () => {
			expect(() =>
				render(
					<StatOutput value={11} visitDate="2022-10-20" temporalUnit="day" />
				)
			).toThrow(/viewedGroup is required/);
		});
	});
});
