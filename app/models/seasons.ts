export const Season = {
	WINTER: 'winter',
	SPRING: 'spring',
	AUTUMN: 'autumn'
} as const;

const seasonToMonthsMap = {
	[Season.WINTER]: ['11', '12', '01', '02', '03'],
	[Season.SPRING]: ['04', '05', '06', '07'],
	[Season.AUTUMN]: ['08', '09', '10']
} as const;

const monthsToSeasonMap = [
	Season.WINTER,
	Season.WINTER,
	Season.WINTER,
	Season.SPRING,
	Season.SPRING,
	Season.SPRING,
	Season.SPRING,
	Season.AUTUMN,
	Season.AUTUMN,
	Season.AUTUMN,
	Season.WINTER,
	Season.WINTER
];
const CES_MONTHS = ['05', '06', '07', '08'];

export function getSeasonName(date: Date) {
	const month = date.getMonth();
	return monthsToSeasonMap[month];
}
export function getSeasonMonths(
	date: Date,
	thisYear: boolean
): (string | number)[] {
	const year = date.getFullYear();
	const season = getSeasonName(date);
	const months = seasonToMonthsMap[season];
	if (thisYear) {
		if (season === Season.WINTER) {
			const monthIndex = date.getMonth();
			const seasonStartYear = monthIndex >= 10 ? year : year - 1;
			return months.map((month) =>
				Number(month) >= 11
					? `${seasonStartYear}-${month}`
					: `${seasonStartYear + 1}-${month}`
			) as string[];
		}
		return months.map((month) => `${year}-${month}`) as string[];
	}
	return months.map((month) => Number(month)) as number[];
}

// "autumn 2023" / "spring 2024" / "winter 2023/24" — winter is labelled by its
// start year because it spans the year end
export function getSeasonPeriodLabel(date: Date): string {
	const season = getSeasonName(date);
	const year = date.getFullYear();
	if (season === Season.WINTER) {
		const seasonStartYear = date.getMonth() >= 10 ? year : year - 1;
		const endYearSuffix = String(seasonStartYear + 1).slice(2);
		return `${season} ${seasonStartYear}/${endYearSuffix}`;
	}
	return `${season} ${year}`;
}

export function isCurrentSeasonPeriod(date: Date, today: Date): boolean {
	const seasonYearMonths = getSeasonMonths(date, true) as string[];
	const todayYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
	return seasonYearMonths.includes(todayYearMonth);
}

export function getCESMonths(
	date: Date,
	thisYear?: boolean
): (string | number)[] {
	const year = date.getFullYear();
	if (thisYear) {
		return CES_MONTHS.map(
			(month) => `${Number(month) > 9 ? year - 1 : year}-${month}`
		) as string[];
	}
	return CES_MONTHS.map((month) => Number(month)) as number[];
}
