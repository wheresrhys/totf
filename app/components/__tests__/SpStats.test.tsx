import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SpStats } from '../SpStats';
import spPageSnapshot from '@/test-fixtures/snapshots/fetchSpPageData.alpha.robin.json';
import type { FullFatPageData } from '@/app/(routes)/species/[speciesName]/page';

const { topSessions, birds, speciesStats } =
	spPageSnapshot as unknown as FullFatPageData;

afterEach(() => {
	cleanup();
});

describe('SpStats', () => {
	describe('Weight category', () => {
		it('shows min-max range with avg and median', () => {
			render(
				<SpStats
					topSessions={topSessions}
					birds={birds}
					speciesStats={speciesStats}
					speciesId={1}
					speciesName="Robin"
					viewedGroupId={1}
				/>
			);
			expect(
				screen.getByText(/Weight:.*16\.5-21g.*avg: 18\.3g.*median: 18g/i)
			).toBeDefined();
		});
	});

	describe('Wing category', () => {
		it('shows min-max range with avg and median', () => {
			render(
				<SpStats
					topSessions={topSessions}
					birds={birds}
					speciesStats={speciesStats}
					speciesId={1}
					speciesName="Robin"
					viewedGroupId={1}
				/>
			);
			expect(
				screen.getByText(/Wing:.*72-80mm.*avg: 74\.2mm.*median: 74mm/i)
			).toBeDefined();
		});
	});
});
