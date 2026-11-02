import { describe, it, expect } from 'vitest';
import { shouldExpandBirdNavByDefault } from '../global-nav-expansion';

describe('shouldExpandBirdNavByDefault', () => {
	it('expands on the home page', () => {
		expect(shouldExpandBirdNavByDefault('/')).toBe(true);
	});

	it('does not expand on any other page', () => {
		expect(shouldExpandBirdNavByDefault('/sessions')).toBe(false);
	});

	it('does not expand when the pathname is unresolved', () => {
		expect(shouldExpandBirdNavByDefault(null)).toBe(false);
	});
});
