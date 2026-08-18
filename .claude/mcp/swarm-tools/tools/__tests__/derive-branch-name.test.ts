import { describe, it, expect } from 'vitest';
import { deriveTicketSlug, buildBranchName } from '../derive-branch-name';

describe('deriveTicketSlug', () => {
	// Usual
	it('slugifies and truncates a typical title to 5 words', () => {
		expect(deriveTicketSlug('Add species breakdown chart to session page')).toBe(
			'add-species-breakdown-chart-to'
		);
	});

	// Structure
	it('keeps a short title unchanged in word count', () => {
		expect(deriveTicketSlug('Fix login bug')).toBe('fix-login-bug');
	});

	it('strips punctuation like slugify does', () => {
		expect(deriveTicketSlug("Fix the group's password reset")).toBe('fix-the-group-s-password');
	});

	// Edge
	it('returns an empty string for an empty title', () => {
		expect(deriveTicketSlug('')).toBe('');
	});

	it('returns fewer than 5 words if the title has fewer words', () => {
		expect(deriveTicketSlug('One')).toBe('one');
	});
});

describe('buildBranchName', () => {
	// Usual
	it('builds a plain ticket branch name', () => {
		expect(buildBranchName(87, 'species-breakdown-chart')).toBe('feature/87-species-breakdown-chart');
	});

	// Structure
	it('appends a chain suffix for multi-PR sequences', () => {
		expect(buildBranchName(87, 'species-breakdown-chart', '1-db')).toBe(
			'feature/87-species-breakdown-chart/1-db'
		);
	});

	// Edge
	it('handles an empty slug', () => {
		expect(buildBranchName(87, '')).toBe('feature/87-');
	});
});
