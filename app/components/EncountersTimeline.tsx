import type { EncounterOfBird } from '@/app/models/bird';

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

	return (
		<div className="relative flex m-2 p-2">
			{years.map((year) => (
				<div key={year} className="flex-1">
					<div className="">{year}</div>
					<div className="flex flex-1 w-full h-8 border border-gray-500 border-width-2">
						{['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map(
							(month, index) => (
								<span
									key={index}
									className={`h-8 flex-1 text-center ${index % 2 === 1 ? 'bg-gray-300' : 'bg-gray-100'}`}
								>
									{month}
								</span>
							)
						)}
					</div>
				</div>
			))}

			{points.map(({ position, encounter }) => (
				<div
					key={position.toString()}
					className={`absolute ${encounter ? 'bottom-4' : 'bottom-5'}`}
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
	);
}
