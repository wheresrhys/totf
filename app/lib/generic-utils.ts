export function groupByColumn<T>(
	column: keyof T,
	rows: T[]
): Record<string, T[]> {
	const aggregator: Record<string, T[]> = {};
	rows.forEach((row: T) => {
		const groupKey = row[column] as string;
		if (!(groupKey in aggregator)) {
			aggregator[groupKey] = [];
		}
		aggregator[groupKey].push(row);
	});
	return aggregator;
}
