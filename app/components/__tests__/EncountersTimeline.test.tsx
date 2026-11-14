import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
	EncountersTimeline,
	getQuarterCollapseThresholdPx
} from '../EncountersTimeline';
import type { EncounterOfBird } from '@/app/models/bird';

function buildEncounter(
	overrides: Partial<{
		isJuv: boolean;
		ageCode: number | null;
		visitDate: string;
	}> = {}
): EncounterOfBird {
	const { isJuv = false, ageCode = 4, visitDate = '2020-07-02' } = overrides;
	return {
		id: 1,
		bird_id: 1,
		age_code: ageCode,
		breeding_condition: null,
		is_juv: isJuv,
		capture_time: '09:00:00',
		max_hatch_year: 2020,
		min_hatch_year: 2020,
		moult_code: null,
		record_type: 'N',
		sex: 'U',
		sexing_method: null,
		ringing_group_id: 1,
		weight: null,
		wing_length: null,
		session: { visit_date: visitDate }
	} as EncounterOfBird;
}

describe('EncountersTimeline', () => {
	describe('calendar container structure', () => {
		it('wraps the year/month grid in a horizontally scrollable container', () => {
			const { container } = render(
				<EncountersTimeline
					encounters={[new Date(2020, 0, 1)]}
					minYear={2020}
					maxYear={2020}
				/>
			);

			const outerDiv = container.firstElementChild;
			expect(outerDiv?.className).toContain('overflow-x-auto');
		});

		it('keeps the year/month grid at its natural, unshrunk width', () => {
			const { container } = render(
				<EncountersTimeline
					encounters={[new Date(2020, 0, 1)]}
					minYear={2020}
					maxYear={2020}
				/>
			);

			const innerRow = container.firstElementChild?.firstElementChild;
			expect(innerRow?.className).toContain('relative');
			expect(innerRow?.className).toContain('flex');
			expect(innerRow?.className).toContain('min-w-max');
		});
	});

	describe('quarter collapse on narrow containers', () => {
		it('renders 4 unlabelled quarter spans alongside the 12 labelled month spans', () => {
			const { container } = render(
				<EncountersTimeline
					encounters={[new Date(2020, 0, 1)]}
					minYear={2020}
					maxYear={2020}
				/>
			);

			// happy-dom can't evaluate @container visibility — both rows are
			// structurally present in the DOM regardless of which one the
			// container-query rule currently shows; Playwright covers the
			// actual visual switch (e2e/authenticated/bird-encounters-timeline.spec.ts).
			const monthsRow = container.querySelector('.timeline-months');
			const quartersRow = container.querySelector('.timeline-quarters');
			expect(monthsRow).not.toBeNull();
			expect(quartersRow).not.toBeNull();

			const monthSpans = monthsRow!.querySelectorAll('span');
			expect(monthSpans).toHaveLength(12);
			expect(Array.from(monthSpans).map((span) => span.textContent)).toEqual([
				'J',
				'F',
				'M',
				'A',
				'M',
				'J',
				'J',
				'A',
				'S',
				'O',
				'N',
				'D'
			]);

			const quarterSpans = quartersRow!.querySelectorAll('span');
			expect(quarterSpans).toHaveLength(4);
			Array.from(quarterSpans).forEach((span) => {
				expect(span.textContent).toBe('');
			});
		});

		it('computes a larger collapse threshold for a bird spanning more years', () => {
			const oneYearThreshold = getQuarterCollapseThresholdPx(1);
			const fourYearThreshold = getQuarterCollapseThresholdPx(4);
			const eightYearThreshold = getQuarterCollapseThresholdPx(8);

			expect(fourYearThreshold).toBeGreaterThan(oneYearThreshold);
			expect(eightYearThreshold).toBeGreaterThan(fourYearThreshold);
		});
	});

	describe('encounter dot positioning', () => {
		it('positions a dot at the percentage offset of its date within the overall date range', () => {
			const minYear = 2020;
			const maxYear = 2021;
			const startDate = new Date(minYear, 0, 1);
			const endDate = new Date(maxYear, 11, 31);
			const middleDate = new Date(2020, 6, 2);
			const expectedPosition =
				(100 * (middleDate.getTime() - startDate.getTime())) /
				(endDate.getTime() - startDate.getTime());

			const { container } = render(
				<EncountersTimeline
					encounters={[middleDate]}
					minYear={minYear}
					maxYear={maxYear}
				/>
			);

			const dot = container.querySelector('.absolute') as HTMLElement;
			expect(parseFloat(dot.style.left)).toBeCloseTo(expectedPosition, 5);
		});

		it('renders a larger ringed dot for an encounter and a smaller plain dot for a bare Date', () => {
			const bareDate = new Date(2020, 0, 1);
			const encounter = buildEncounter({ visitDate: '2020-06-15' });

			// The component's own isEncounter() runtime check accepts a mixed
			// Date/EncounterOfBird array, but its prop type only declares the two
			// homogeneous array shapes separately — cast to exercise that mixed
			// case as the real NotableRetrapsTable call site effectively can't.
			// eslint-disable-next-line no-restricted-syntax -- mixed-array prop type mismatch, see comment above
			const encounters = [bareDate, encounter] as unknown as Date[];

			const { container } = render(
				<EncountersTimeline
					encounters={encounters}
					minYear={2020}
					maxYear={2020}
				/>
			);

			const dotWrappers = container.querySelectorAll('.absolute');
			expect(dotWrappers).toHaveLength(2);

			const [bareDateWrapper, encounterWrapper] = Array.from(dotWrappers);
			expect(bareDateWrapper.className).toContain('bottom-1');
			expect(encounterWrapper.className).toContain('bottom-2');

			const bareDateDot = bareDateWrapper.firstElementChild;
			expect(bareDateDot?.className).toContain('w-2');
			expect(bareDateDot?.className).toContain('h-2');
			expect(bareDateDot?.className).not.toContain('outline');

			const encounterDot = encounterWrapper.firstElementChild;
			expect(encounterDot?.className).toContain('w-4');
			expect(encounterDot?.className).toContain('h-4');
			expect(encounterDot?.className).toContain('outline-2');
			expect(encounterDot?.className).toContain('outline-black');
		});

		it('renders black-on-white for a juvenile encounter and white-on-black otherwise', () => {
			const juvenileEncounter = buildEncounter({
				isJuv: true,
				visitDate: '2020-05-01'
			});
			const adultEncounter = buildEncounter({
				isJuv: false,
				visitDate: '2020-08-01'
			});

			const { container } = render(
				<EncountersTimeline
					encounters={[juvenileEncounter, adultEncounter]}
					minYear={2020}
					maxYear={2020}
				/>
			);

			const dotWrappers = container.querySelectorAll('.absolute');
			const [juvenileWrapper, adultWrapper] = Array.from(dotWrappers);

			expect(juvenileWrapper.firstElementChild?.className).toContain(
				'bg-white'
			);
			expect(juvenileWrapper.firstElementChild?.className).toContain(
				'text-black'
			);
			expect(adultWrapper.firstElementChild?.className).toContain('bg-black');
			expect(adultWrapper.firstElementChild?.className).toContain('text-white');
		});
	});
});
