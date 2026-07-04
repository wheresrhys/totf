import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MonthSessionsHeading } from '../MonthSessions';
import sessionsSnapshot from '@/test-fixtures/snapshots/fetchAllSessions.alpha.json';
import type { SessionWithEncountersCount } from '@/app/models/session';

const allSessions = sessionsSnapshot as unknown as SessionWithEncountersCount[];
const june2022 = allSessions.filter((s) => s.visit_date.startsWith('2022-06'));

describe('MonthSessionsHeading', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders month name, session count, and bird count', () => {
		render(<MonthSessionsHeading model={{ monthData: june2022 }} />);
		// june2022 has 1 session with 11 birds
		expect(screen.getByText(/June/i)).toBeDefined();
		expect(screen.getByText(/1 sessions/)).toBeDefined();
		expect(screen.getByText(/11 birds/)).toBeDefined();
	});
});
