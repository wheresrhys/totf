import type { RecordScope } from '@/app/models/highlights/shared/record-scope';
import type {
	SessionTotalJuvRecordHighlight,
	SessionTotalMetric,
	SessionTotalRecordHighlight,
	SinceComparisonHighlight,
	SpeciesCountRecordHighlight,
	SpeciesJuvCountRecordHighlight
} from '../../types';

export const periodFields = {
	year: 2026,
	isCurrentYear: true
} as const;

export function sessionTotalRecord(
	metric: SessionTotalMetric,
	scope: RecordScope,
	value: number
): SessionTotalRecordHighlight {
	return {
		type: 'session-total-record',
		metric,
		scope,
		value,
		...periodFields
	};
}

export function speciesCountRecord(
	speciesName: string,
	scope: RecordScope,
	value: number,
	extra: Partial<SpeciesCountRecordHighlight> = {}
): SpeciesCountRecordHighlight {
	return {
		type: 'species-count-record',
		speciesName,
		scope,
		value,
		...periodFields,
		...extra
	};
}

export function speciesJuvCountRecord(
	speciesName: string,
	scope: RecordScope,
	value: number,
	extra: Partial<SpeciesJuvCountRecordHighlight> = {}
): SpeciesJuvCountRecordHighlight {
	return {
		type: 'species-juv-count-record',
		speciesName,
		scope,
		value,
		...periodFields,
		...extra
	};
}

export function sessionTotalJuvRecord(
	scope: RecordScope,
	value: number
): SessionTotalJuvRecordHighlight {
	return {
		type: 'session-total-juv-record',
		scope,
		value,
		...periodFields
	};
}

export const busiestSince: SinceComparisonHighlight = {
	type: 'since-comparison',
	kind: 'busiest',
	value: 120,
	sinceDate: '2025-09-06'
};
export const quietestSince: SinceComparisonHighlight = {
	type: 'since-comparison',
	kind: 'quietest',
	value: 3,
	sinceDate: '2023-09-14'
};
