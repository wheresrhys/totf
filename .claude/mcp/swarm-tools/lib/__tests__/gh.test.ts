import { describe, it, expect } from 'vitest';
import { parseLabelNames } from '../gh';

describe('parseLabelNames', () => {
	// Usual
	it('extracts the name column from tab-separated label list output', () => {
		const stdout = ['ready\t\t#17fc48', 'opus\tFiddly ticket\t#7B2FBE'].join('\n');
		expect(parseLabelNames(stdout)).toEqual(['ready', 'opus']);
	});

	// Edge
	it('returns an empty array for empty output', () => {
		expect(parseLabelNames('')).toEqual([]);
	});

	it('skips blank lines', () => {
		const stdout = ['ready\t\t#17fc48', '', 'opus\tFiddly ticket\t#7B2FBE'].join('\n');
		expect(parseLabelNames(stdout)).toEqual(['ready', 'opus']);
	});
});
