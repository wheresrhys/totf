import { describe, it, expect } from 'vitest';
import { slugify } from '../slugify';

describe('slugify', () => {
	// Usual
	it('lowercases and hyphenates a simple multi-word name', () => {
		expect(slugify('My Group')).toBe('my-group');
	});

	// Structure (one per transform branch)
	it('strips leading punctuation', () => {
		expect(slugify('!!My Group')).toBe('my-group');
	});

	it('strips trailing punctuation', () => {
		expect(slugify('My Group!!')).toBe('my-group');
	});

	it('collapses repeated spaces into a single hyphen', () => {
		expect(slugify('My   Group')).toBe('my-group');
	});

	it('collapses repeated hyphens into a single hyphen', () => {
		expect(slugify('My--Group')).toBe('my-group');
	});

	it('preserves digits in the name', () => {
		expect(slugify('Group 42')).toBe('group-42');
	});

	it('replaces symbols/underscores with a hyphen', () => {
		expect(slugify('My_Group&Co')).toBe('my-group-co');
	});

	it('strips non-ASCII/accented characters rather than transliterating them', () => {
		expect(slugify('Café Ringers')).toBe('caf-ringers');
	});

	// Edge
	it('returns an empty string for an empty string input', () => {
		expect(slugify('')).toBe('');
	});

	it('returns an empty string for an all-punctuation input', () => {
		expect(slugify('!!!')).toBe('');
	});

	it('handles a single-character input', () => {
		expect(slugify('A')).toBe('a');
	});
});
