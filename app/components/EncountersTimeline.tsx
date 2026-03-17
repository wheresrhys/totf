export function EncountersTimeline({
	dates,
	maxYear,
	minYear
}: {
	dates: Date[];
	maxYear?: number;
	minYear?: number;
}) {
	minYear = minYear ?? dates[0].getFullYear();
	maxYear = maxYear ?? dates[dates.length - 1].getFullYear();
	const startDate = new Date(minYear, 0, 1);
	const endDate = new Date(maxYear, 11, 31);
	const years = [...Array(maxYear + 1 - minYear)].map(
		(_, index) => minYear + index
	);
	const dateRange = endDate.getTime() - startDate.getTime();
	const pointPositions = dates.map(
		(date) => (100 * (date.getTime() - startDate.getTime())) / dateRange
	);
	return (
		<div className="relative flex m-2 p-2">
			{years.map((year) => (
				<div key={year} className="flex-1">
					<div className="">{year}</div>
					<div className="flex flex-1 w-full h-8 border border-gray-500 border-width-2">
						{[...Array(12)].map((_, index) => (
							<span
								key={index}
								className={`h-8 flex-1 ${index % 2 === 1 ? 'bg-gray-300' : 'bg-gray-100'}`}
							></span>
						))}
					</div>
				</div>
			))}

			{pointPositions.map((position) => (
				<div
					key={position.toString()}
					className="absolute bottom-5"
					style={{ left: `${position}%` }}
				>
					<div className="w-2 h-2 bg-primary rounded-full"></div>
				</div>
			))}
		</div>
	);
}
