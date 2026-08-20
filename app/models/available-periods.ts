export type AvailablePeriod = {
	year: string;
	months: string[];
};

// Buckets an array of ISO date strings (YYYY-MM-DD, as returned for Postgres
// `date` columns) into a year -> months tree, sorted ascending. Used to drive
// the /stats page's nested navigation into the /highlights route family.
export function buildAvailablePeriodsTree(
	sessionDates: string[]
): AvailablePeriod[] {
	const monthsByYear = new Map<string, Set<string>>();

	for (const sessionDate of sessionDates) {
		const [year, month] = sessionDate.split('-');
		if (!monthsByYear.has(year)) {
			monthsByYear.set(year, new Set());
		}
		monthsByYear.get(year)!.add(month);
	}

	return Array.from(monthsByYear.entries())
		.sort(([yearA], [yearB]) => yearA.localeCompare(yearB))
		.map(([year, months]) => ({
			year,
			months: Array.from(months).sort()
		}));
}
