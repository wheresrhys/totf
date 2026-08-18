import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StatOutput } from '../StatOutput';
import type { LocationRow } from '@/app/models/db';

const mockLocation = {
	id: 5,
	location_name: 'Test Reserve'
} as LocationRow;

afterEach(() => {
	cleanup();
});

describe('StatOutput', () => {
	it('renders a link to /group/<slug>/session/<date> for temporalUnit="day"', () => {
		render(
			<StatOutput
				value={3}
				visitDate="2024-05-10"
				temporalUnit="day"
				viewedGroup={{ id: 1, slug: 'alpha' }}
			/>
		);
		const link = screen.getByRole('link');
		expect(link.getAttribute('href')).toBe('/group/alpha/session/2024-05-10');
	});

	describe('with a location prop', () => {
		it('includes /site/<id> in the href', () => {
			render(
				<StatOutput
					value={3}
					visitDate="2024-05-10"
					temporalUnit="day"
					viewedGroup={{ id: 1, slug: 'alpha' }}
					location={mockLocation}
				/>
			);
			const link = screen.getByRole('link');
			expect(link.getAttribute('href')).toBe(
				'/group/alpha/session/2024-05-10/site/5'
			);
		});
	});

	describe('link={false}', () => {
		it('renders plain text, no anchor', () => {
			render(
				<StatOutput
					value={3}
					visitDate="2024-05-10"
					temporalUnit="day"
					viewedGroup={{ id: 1, slug: 'alpha' }}
					link={false}
				/>
			);
			expect(screen.queryByRole('link')).toBeNull();
			expect(screen.getByText(/10 May 2024/)).toBeDefined();
		});
	});

	describe('non-day temporal units', () => {
		it('renders no link regardless of viewedGroup', () => {
			render(
				<StatOutput
					value={3}
					visitDate="2024-05-10"
					temporalUnit="month"
					viewedGroup={{ id: 1, slug: 'alpha' }}
				/>
			);
			expect(screen.queryByRole('link')).toBeNull();
		});
	});

	describe('no viewedGroup', () => {
		it('throws when temporalUnit is "day"', () => {
			expect(() =>
				render(
					<StatOutput value={3} visitDate="2024-05-10" temporalUnit="day" />
				)
			).toThrow(
				'viewedGroup is required to output stats for day temporal unit'
			);
		});
	});
});
