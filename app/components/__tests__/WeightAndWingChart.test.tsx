import { describe, it, expect } from 'vitest';
import {
	getChartData,
	type SexedGraphableBird
} from '@/app/components/WeightAndWingChart';

function makeBird(encounter: {
	age_code: number;
	is_juv: boolean;
	weight?: number | null;
	wing_length?: number | null;
}): SexedGraphableBird {
	return {
		sex: 'U',
		sexCertainty: 0,
		encounters: [
			{
				age_code: encounter.age_code,
				is_juv: encounter.is_juv,
				sex: 'U',
				weight: encounter.weight === undefined ? 20 : encounter.weight,
				wing_length:
					encounter.wing_length === undefined ? 65 : encounter.wing_length
			}
		]
	} as SexedGraphableBird;
}

function seriesCounts(chartData: ReturnType<typeof getChartData>) {
	return Object.fromEntries(
		chartData.map((series) => [series.name, series.data.length])
	);
}

describe('getChartData', () => {
	describe("chartGrouping: 'age'", () => {
		it('plots an age-3, is_juv-true encounter (3J) in the Juv series', () => {
			const bird = makeBird({ age_code: 3, is_juv: true });
			const counts = seriesCounts(getChartData([bird], 'age'));
			expect(counts).toEqual({ Juv: 1, Postjuv: 0, Ad: 0, U: 0 });
		});

		it('plots an age-1, is_juv-true encounter in the Juv series', () => {
			const bird = makeBird({ age_code: 1, is_juv: true });
			const counts = seriesCounts(getChartData([bird], 'age'));
			expect(counts).toEqual({ Juv: 1, Postjuv: 0, Ad: 0, U: 0 });
		});

		it('plots an age-3, is_juv-false (bare 3) encounter in the Postjuv series', () => {
			const bird = makeBird({ age_code: 3, is_juv: false });
			const counts = seriesCounts(getChartData([bird], 'age'));
			expect(counts).toEqual({ Juv: 0, Postjuv: 1, Ad: 0, U: 0 });
		});

		it('omits an age-1, is_juv-false (pulli) encounter from the chart entirely — not plotted in any series', () => {
			const bird = makeBird({ age_code: 1, is_juv: false });
			const counts = seriesCounts(getChartData([bird], 'age'));
			expect(counts).toEqual({ Juv: 0, Postjuv: 0, Ad: 0, U: 0 });
		});

		it('plots an age-2 encounter in the U series', () => {
			const bird = makeBird({ age_code: 2, is_juv: false });
			const counts = seriesCounts(getChartData([bird], 'age'));
			expect(counts).toEqual({ Juv: 0, Postjuv: 0, Ad: 0, U: 1 });
		});

		it('plots an age-code-greater-than-3 encounter in the Ad series', () => {
			const bird = makeBird({ age_code: 6, is_juv: false });
			const counts = seriesCounts(getChartData([bird], 'age'));
			expect(counts).toEqual({ Juv: 0, Postjuv: 0, Ad: 1, U: 0 });
		});

		it('omits an encounter with a null weight or wing_length from every series', () => {
			const birds = [
				makeBird({ age_code: 3, is_juv: true, weight: null }),
				makeBird({ age_code: 6, is_juv: false, wing_length: null })
			];
			const counts = seriesCounts(getChartData(birds, 'age'));
			expect(counts).toEqual({ Juv: 0, Postjuv: 0, Ad: 0, U: 0 });
		});
	});
});
