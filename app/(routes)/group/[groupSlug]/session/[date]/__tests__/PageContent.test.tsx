import { describe, it, expect } from 'vitest';
import { buildSessionSummarySentence } from '../PageContent';
import type { SessionEncounter } from '@/app/models/session';
import type { SessionChronology } from '@/app/models/session-chronology';

function makeEncounters(recordTypes: Array<'N' | 'S'>): SessionEncounter[] {
	return recordTypes.map(
		(record_type) => ({ record_type }) as unknown as SessionEncounter
	);
}

function makeChronology(durationMinutes: number | null): SessionChronology {
	return {
		startTime: null,
		endTime: null,
		durationMinutes,
		netRounds: []
	};
}

describe('buildSessionSummarySentence', () => {
	describe('usual cases', () => {
		it('renders the full sentence with plural birds, new, retraps, species, and duration', () => {
			const encounters = makeEncounters([
				...Array(46).fill('N'),
				...Array(14).fill('S')
			]);
			const sentence = buildSessionSummarySentence(
				encounters,
				9,
				makeChronology(285)
			);
			expect(sentence).toBe(
				'60 birds (46 new, 14 retraps) from 9 species in ~4h 45m'
			);
		});
	});

	describe('structure — pluralization branches', () => {
		it('uses singular "bird" when the total is exactly 1', () => {
			const sentence = buildSessionSummarySentence(
				makeEncounters(['N']),
				1,
				makeChronology(null)
			);
			expect(sentence).toContain('1 bird ');
			expect(sentence).not.toContain('1 birds');
		});

		it('uses singular "retrap" when the retrap count is exactly 1', () => {
			const sentence = buildSessionSummarySentence(
				makeEncounters(['N', 'S']),
				1,
				makeChronology(null)
			);
			expect(sentence).toContain('1 retrap)');
			expect(sentence).not.toContain('1 retraps');
		});

		it('keeps "species" unpluralized when the count is 1', () => {
			const sentence = buildSessionSummarySentence(
				makeEncounters(['N']),
				1,
				makeChronology(null)
			);
			expect(sentence).toContain('from 1 species');
		});

		it('keeps "new" unpluralized regardless of count', () => {
			const sentence = buildSessionSummarySentence(
				makeEncounters(['N']),
				1,
				makeChronology(null)
			);
			expect(sentence).toContain('1 new');
			expect(sentence).not.toContain('1 news');
		});
	});

	describe('edge cases', () => {
		it('omits the duration clause when durationMinutes is null', () => {
			const sentence = buildSessionSummarySentence(
				makeEncounters(['N', 'S']),
				2,
				makeChronology(null)
			);
			expect(sentence).not.toContain('in ~');
		});

		it('renders zero counts for a session with no encounters', () => {
			const sentence = buildSessionSummarySentence([], 0, makeChronology(null));
			expect(sentence).toBe('0 birds (0 new, 0 retraps) from 0 species');
		});

		it('omits the duration clause when there are encounters but none have a capture_time', () => {
			const sentence = buildSessionSummarySentence(
				makeEncounters(['N', 'N', 'S']),
				2,
				makeChronology(null)
			);
			expect(sentence).toContain('3 birds (2 new, 1 retrap)');
			expect(sentence).toContain('from 2 species');
			expect(sentence).not.toContain('in ~');
		});

		it('renders ~0m when start and end capture_time are identical', () => {
			const sentence = buildSessionSummarySentence(
				makeEncounters(['N']),
				1,
				makeChronology(0)
			);
			expect(sentence).toContain('in ~0m');
		});
	});
});
