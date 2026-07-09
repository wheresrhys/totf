export function findUnusedRings(
	rings: string[],
	prefixLength: number
): string[] {
	if (rings.length === 0) return [];

	const suffixLength = rings[0].length - prefixLength;
	const prefix = rings[0].slice(0, prefixLength);
	const suffixes = rings.map((ring) => parseInt(ring.slice(prefixLength), 10));
	const min = Math.min(...suffixes);
	const max = Math.max(...suffixes);
	const suffixSet = new Set(suffixes);

	const unused: string[] = [];
	for (let i = min + 1; i < max; i++) {
		if (!suffixSet.has(i)) {
			unused.push(`${prefix}${String(i).padStart(suffixLength, '0')}`);
		}
	}
	return unused;
}
