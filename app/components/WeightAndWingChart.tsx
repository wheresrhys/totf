import { type Sex } from '@/app/models/bird';
import { useState } from 'react';
import { ScatterChart, type ScatterChartData } from 'react-chartkick';

type GraphableEncounterData = {
	age_code: number;
	sex: string;
	weight: number;
	wing_length: number;
};

export type GraphableBird = { encounters: GraphableEncounterData[] };
export type SexedGraphableBird = GraphableBird & {
	sex: Sex;
	sexCertainty: number;
};

//function to find the median of the given array
function median(arr: number[]): number {
	const mid = Math.floor(arr.length / 2);
	const sortedArr = arr.sort((a, b) => a - b);

	if (arr.length % 2 === 0) {
		return (sortedArr[mid - 1] + sortedArr[mid]) / 2;
	} else {
		return sortedArr[mid];
	}
}

function addNoiseToWingLength(x: number | null) {
	if (!x) return null;
	return x + (Math.random() - 0.5) * 0.3;
}

function getMedian(
	bird: SexedGraphableBird,
	property: keyof GraphableEncounterData
) {
	return median(
		bird.encounters
			.map((encounter) => encounter[property])
			.filter((number): number is number => Boolean(number))
	);
}

function getNoisyMedian(
	bird: SexedGraphableBird,
	property: keyof GraphableEncounterData
) {
	return addNoiseToWingLength(getMedian(bird, property));
}

function getWingWeightXYBird(
	bird: SexedGraphableBird
): [number, number] | null {
	const wing = getNoisyMedian(bird, 'wing_length');
	const weight = getMedian(bird, 'weight');

	return wing && weight ? [wing, weight] : null;
}

function isValidPoint(
	arr: [number | null, number | null]
): arr is [number, number] {
	if (arr[0] && arr[1]) {
		return true;
	} else {
		return false;
	}
}

function getWingWeightXYEncounter(
	encounter: GraphableEncounterData
): [number, number] | null {
	const point = [
		addNoiseToWingLength(encounter.wing_length),
		encounter.weight
	] as [number | null, number | null];
	return isValidPoint(point) ? point : null;
}

function getChartData(
	birds: SexedGraphableBird[],
	chartGrouping: 'sex' | 'age'
): ScatterChartData[] {
	if (chartGrouping === 'sex') {
		return [
			{
				name: 'F',
				data: birds
					.filter((bird) => bird.sex === 'F')
					.map(getWingWeightXYBird)
					.filter((point) => point !== null)
			},
			{
				name: 'M',
				data: birds
					.filter((bird) => bird.sex === 'M')
					.map(getWingWeightXYBird)
					.filter((point) => point !== null)
			},
			{
				name: 'U',
				data: birds
					.filter((bird) => bird.sex === 'U')
					.map(getWingWeightXYBird)
					.filter((point) => point !== null)
			}
		];
	}
	const allEncounters = birds.flatMap(({ encounters }) => encounters);
	return [
		{
			name: 'Juv',
			data: allEncounters
				.filter((encounter) => encounter.age_code === 3)
				.map(getWingWeightXYEncounter)
				.filter((point) => point !== null)
		},
		{
			name: 'Ad',
			data: allEncounters
				.filter((encounter) => encounter.age_code > 3)
				.map(getWingWeightXYEncounter)
				.filter((point) => point !== null)
		},
		{
			name: 'U',
			data: allEncounters
				.filter((encounter) => encounter.age_code < 3)
				.map(getWingWeightXYEncounter)
				.filter((point) => point !== null)
		}
	];
}

export function WeightVsWingLengthChart({
	birds
}: {
	birds: SexedGraphableBird[];
}) {
	const [chartGrouping, setChartGrouping] = useState<'sex' | 'age'>('sex');
	const chartData = getChartData(birds, chartGrouping);
	return (
		<>
			<div className="mt-3 mb-3 flex justify-end">
				<div
					id="toggle-count"
					className="border-base-content/20 flex gap-0.5 rounded-field border p-0.5"
				>
					<label
						htmlFor="toggle-count-monthly"
						className="btn btn-sm btn-text has-checked:btn-active"
					>
						<span>By sex</span>
						<input
							id="toggle-count-monthly"
							name="toggle-count"
							type="radio"
							className="hidden"
							checked={chartGrouping === 'sex'}
							onChange={(event) =>
								setChartGrouping(event.target.checked ? 'sex' : 'age')
							}
						/>
					</label>
					<label
						htmlFor="toggle-count-annual"
						className="btn btn-sm btn-text has-checked:btn-active"
					>
						<span>By age</span>
						<input
							id="toggle-count-annual"
							name="toggle-count"
							type="radio"
							className="hidden"
							checked={chartGrouping === 'age'}
							onChange={(event) =>
								setChartGrouping(event.target.checked ? 'age' : 'sex')
							}
						/>
					</label>
				</div>
			</div>
			<ScatterChart
				min={null}
				data={chartData}
				xtitle="Wing"
				ytitle="Weight"
				colors={['#f88', '#88f', '#bbb']}
				library={{ elements: { point: { radius: 1 } } }}
			/>
		</>
	);
}
