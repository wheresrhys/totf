import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildAddBlockedByArgs, linkTicketDependencies } from '../link-ticket-dependencies';
import { runGh } from '../../lib/gh';

vi.mock('../../lib/gh', async (importActual) => {
	const actual = await importActual<typeof import('../../lib/gh')>();
	return { ...actual, runGh: vi.fn() };
});

const runGhMock = vi.mocked(runGh);

beforeEach(() => {
	runGhMock.mockReset();
	runGhMock.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
});

describe('buildAddBlockedByArgs', () => {
	it('joins a single blocker into the --add-blocked-by argv', () => {
		expect(buildAddBlockedByArgs(500, [123])).toEqual([
			'issue',
			'edit',
			'500',
			'--add-blocked-by',
			'123',
		]);
	});

	it('comma-joins multiple blockers into one call', () => {
		expect(buildAddBlockedByArgs(500, [123, 456])).toEqual([
			'issue',
			'edit',
			'500',
			'--add-blocked-by',
			'123,456',
		]);
	});

	it('returns null for an empty blocker list', () => {
		expect(buildAddBlockedByArgs(500, [])).toBeNull();
	});
});

describe('linkTicketDependencies', () => {
	// Usual
	it('applies a single blocker', async () => {
		const result = await linkTicketDependencies(500, [123]);
		expect(result).toEqual({ ok: true, applied: [123] });
		expect(runGhMock).toHaveBeenCalledTimes(1);
		expect(runGhMock).toHaveBeenCalledWith(['issue', 'edit', '500', '--add-blocked-by', '123']);
	});

	// Structure
	it('applies multiple blockers in a single call', async () => {
		const result = await linkTicketDependencies(500, [123, 456]);
		expect(result).toEqual({ ok: true, applied: [123, 456] });
		expect(runGhMock).toHaveBeenCalledTimes(1);
		expect(runGhMock).toHaveBeenCalledWith(['issue', 'edit', '500', '--add-blocked-by', '123,456']);
	});

	// Edge
	it('makes no gh call for an empty blocker list', async () => {
		const result = await linkTicketDependencies(500, []);
		expect(result).toEqual({ ok: true, applied: [] });
		expect(runGhMock).not.toHaveBeenCalled();
	});

	// Edge
	it('surfaces a gh failure rather than swallowing it', async () => {
		runGhMock.mockResolvedValue({ stdout: '', stderr: 'could not resolve to an Issue', exitCode: 1 });
		await expect(linkTicketDependencies(999999, [123])).rejects.toThrow('could not resolve to an Issue');
	});
});
