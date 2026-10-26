import { describe, it, expect } from 'vitest';
import { makeQueryChain } from '../query-chain';

// `makeQueryChain`'s chain is a `Record<string, unknown>` bag of mocks (it
// stands in for a PostgrestFilterBuilder without implementing its type), so
// each method has to be narrowed before it can be called.
type ShorthandFilterMethod = (column: string, value: unknown) => unknown;

describe('makeQueryChain', () => {
	it('records .eq() calls into record.filters alongside .gte()/.lte()', () => {
		const { chain, record } = makeQueryChain([]);

		(chain.eq as ShorthandFilterMethod)('temporal_unit', 'month');
		(chain.gte as ShorthandFilterMethod)('time_period', '2023-01-01');

		expect(record.filters).toEqual([
			{ column: 'temporal_unit', operator: 'eq', value: 'month' },
			{ column: 'time_period', operator: 'gte', value: '2023-01-01' }
		]);
	});
});
