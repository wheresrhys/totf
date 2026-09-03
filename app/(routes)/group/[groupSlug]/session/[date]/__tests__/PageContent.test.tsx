import { describe, it, expect } from 'vitest';
import { buildSessionSummarySentence } from '../PageContent';
import type { SessionEncounter } from '@/app/models/session';

function makeEncounters(recordTypes: Array<'N' | 'S'>): SessionEncounter[] {
	return recordTypes.map(
		(record_type) => ({ record_type }) as unknown as SessionEncounter
	);
}

describe('buildSessionSummarySentence', () => {
	describe('usual cases', () => {
		it('renders the full sentence with plural birds, new, retraps, species, and duration', () => {
			const encounters = makeEncounters([
				...Array(46).fill('N'),
				...Array(14).fill('S')
			]);
			const sentence = buildSessionSummarySentence(encounters, 9);
			expect(sentence).toBe('60 birds of 9 species, 46 new and 14 retraps');
		});
	});

	describe('structure — pluralization branches', () => {
		it('uses singular "bird" when the total is exactly 1', () => {
			const sentence = buildSessionSummarySentence(makeEncounters(['N']), 1);
			expect(sentence).toContain('1 bird ');
			expect(sentence).not.toContain('1 birds');
		});

		it('uses singular "retrap" when the retrap count is exactly 1', () => {
			const sentence = buildSessionSummarySentence(
				makeEncounters(['N', 'S']),
				1
			);
			expect(sentence).toContain('1 retrap');
			expect(sentence).not.toContain('1 retraps');
		});

		it('keeps "species" unpluralized when the count is 1', () => {
			const sentence = buildSessionSummarySentence(makeEncounters(['N']), 1);
			expect(sentence).toContain('of 1 species');
		});

		it('keeps "new" unpluralized regardless of count', () => {
			const sentence = buildSessionSummarySentence(makeEncounters(['N']), 1);
			expect(sentence).toContain('1 new');
			expect(sentence).not.toContain('1 news');
		});
	});

	describe('edge cases', () => {
		it('omits the duration clause when durationMinutes is null', () => {
			const sentence = buildSessionSummarySentence(
				makeEncounters(['N', 'S']),
				2
			);
			expect(sentence).not.toContain('in ~');
		});

		it('renders zero counts for a session with no encounters', () => {
			const sentence = buildSessionSummarySentence([], 0);
			expect(sentence).toBe('0 birds of 0 species, 0 new and 0 retraps');
		});
	});
});
