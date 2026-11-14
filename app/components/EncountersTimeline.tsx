import { useId } from 'react';
import type { EncounterOfBird } from '@/app/models/bird';

const MONTH_LABELS = [
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
];
const QUARTER_COUNT = 4;

// Empirically measured in Chrome (see PR description for methodology): a
// single year block's natural (unshrunk) min-content width when showing all
// 12 labelled month spans is ~128.8px, and this scales linearly with the
// number of years shown (each year block is independently flex-1 sized by
// its own content) with a negligible (<1px) intercept. Rounded to 129px/year.
const MEASURED_YEAR_BLOCK_WIDTH_PX = 129;

/**
 * The container-query width (in px) at which a timeline with `yearsSpanned`
 * years should switch from 4 unlabelled quarter spans per year back to the
 * full 12 labelled month spans per year. Scales linearly with years spanned
 * rather than using one fixed breakpoint for every bird, since more years
 * competing for the same width need proportionally more room before full
 * month labels stop overflowing.
 */
export function getQuarterCollapseThresholdPx(yearsSpanned: number): number {
	return MEASURED_YEAR_BLOCK_WIDTH_PX * yearsSpanned;
}

function isEncounter(value: Date | EncounterOfBird): value is EncounterOfBird {
	return 'session' in value;
}

function getDate(value: Date | EncounterOfBird): Date {
	return isEncounter(value) ? new Date(value.session.visit_date) : value;
}

function getPosition(date: Date, startDate: Date, dateRange: number): number {
	return (100 * (date.getTime() - startDate.getTime())) / dateRange;
}

export function EncountersTimeline({
	encounters,
	maxYear,
	minYear
}: {
	encounters: EncounterOfBird[] | Date[];
	maxYear?: number;
	minYear?: number;
}) {
	const dates = encounters.map(getDate);
	minYear = minYear ?? dates[0].getFullYear();
	maxYear = maxYear ?? dates[dates.length - 1].getFullYear();
	const startDate = new Date(minYear, 0, 1);
	const endDate = new Date(maxYear, 11, 31);
	const years = [...Array(maxYear + 1 - minYear)].map(
		(_, index) => minYear + index
	);
	const dateRange = endDate.getTime() - startDate.getTime();
	const points = encounters.map((encounter) => {
		const date = getDate(encounter);
		return {
			date,
			position: getPosition(date, startDate, dateRange),
			encounter: isEncounter(encounter) ? encounter : null
		};
	});

	const id = useId();
	const thresholdPx = getQuarterCollapseThresholdPx(years.length);

	return (
		<div className="overflow-x-auto @container" data-timeline-id={id}>
			{/*
				The inner "relative flex min-w-max" row must stay this div's
				FIRST child (PR #1442's test asserts `firstElementChild?.firstElementChild`
				is that row) — the <style> tag's own position doesn't matter for
				the container-query rule to apply, so it's placed after instead.
			*/}
			<div className="relative flex min-w-max">
				{years.map((year) => (
					<div key={year} className="flex-1">
						<div className="">{year}</div>
						<div className="timeline-months hidden flex-1 w-full h-8 border border-gray-500 border-width-2">
							{MONTH_LABELS.map((month, index) => (
								<span
									key={index}
									className={`h-8 flex-1 text-center ${index % 2 === 1 ? 'bg-gray-300' : 'bg-gray-100'}`}
								>
									{month}
								</span>
							))}
						</div>
						<div className="timeline-quarters flex flex-1 w-full h-8 border border-gray-500 border-width-2">
							{[...Array(QUARTER_COUNT)].map((_, index) => (
								<span
									key={index}
									className={`h-8 flex-1 ${index % 2 === 1 ? 'bg-gray-300' : 'bg-gray-100'}`}
								/>
							))}
						</div>
					</div>
				))}

				{points.map(({ position, encounter }) => (
					<div
						key={position.toString()}
						className={`absolute ${encounter ? 'bottom-2' : 'bottom-1'}`}
						style={{ left: `${position}%` }}
					>
						<div
							className={`${encounter ? 'w-4 h-4 outline outline-2 outline-black' : 'w-2 h-2'} rounded-full text-center text-xs ${encounter?.is_juv ? 'bg-white text-black ' : 'bg-black text-white'}`}
						>
							{encounter?.age_code ?? ''}
						</div>
					</div>
				))}
			</div>
			<style>{`
				@container (min-width: ${thresholdPx}px) {
					[data-timeline-id="${id}"] .timeline-months { display: flex; }
					[data-timeline-id="${id}"] .timeline-quarters { display: none; }
				}
			`}</style>
		</div>
	);
}
