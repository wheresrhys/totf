import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportHighlight } from '../highlight-reports';

const { mockCanReportHighlights, mockInsert, mockFrom } = vi.hoisted(() => {
	const mockCanReportHighlights = vi.fn();
	const mockInsert = vi.fn();
	const mockFrom = vi.fn(() => ({ insert: mockInsert }));
	return { mockCanReportHighlights, mockInsert, mockFrom };
});

vi.mock('@/app/lib/qa-reporting', () => ({
	canReportHighlights: mockCanReportHighlights
}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: vi.fn().mockResolvedValue({ from: mockFrom })
}));

vi.mock('@/lib/supabase', () => ({
	catchSupabaseErrors: ({
		data,
		error
	}: {
		data: unknown;
		error: { message: string } | null;
	}) => {
		if (error) throw new Error(`Failed to fetch data: ${error.message}`);
		return data ?? null;
	}
}));

function makeFormData(fields: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [key, value] of Object.entries(fields)) fd.append(key, value);
	return fd;
}

const VALID_FIELDS = {
	pageUrl: 'https://example.test/summary',
	highlightText: 'First Robin ever',
	reason: 'Species looks wrong',
	highlightBody: JSON.stringify({ descriptor: { type: 'test' } })
};

describe('reportHighlight', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCanReportHighlights.mockResolvedValue(true);
		mockInsert.mockReturnValue({
			then: (resolve: (v: { data: null; error: null }) => unknown) =>
				Promise.resolve({ data: null, error: null }).then(resolve)
		});
	});

	it('returns a failure state without inserting when canReportHighlights is false', async () => {
		mockCanReportHighlights.mockResolvedValue(false);

		const result = await reportHighlight(null, makeFormData(VALID_FIELDS));

		expect(result).toEqual({
			success: false,
			error: 'Reporting is not enabled'
		});
		expect(mockFrom).not.toHaveBeenCalled();
	});

	it('returns a failure state when pageUrl or highlightText is missing', async () => {
		const fd = makeFormData(VALID_FIELDS);
		fd.delete('pageUrl');

		const result = await reportHighlight(null, fd);

		expect(result).toEqual({ success: false, error: 'Malformed report' });
		expect(mockFrom).not.toHaveBeenCalled();
	});

	it('returns a failure state when reason is empty', async () => {
		const result = await reportHighlight(
			null,
			makeFormData({ ...VALID_FIELDS, reason: '  ' })
		);

		expect(result).toEqual({ success: false, error: 'Please give a reason' });
		expect(mockFrom).not.toHaveBeenCalled();
	});

	it('returns a failure state when the highlight body is not valid JSON', async () => {
		const result = await reportHighlight(
			null,
			makeFormData({ ...VALID_FIELDS, highlightBody: 'not json' })
		);

		expect(result).toEqual({
			success: false,
			error: 'Malformed highlight data'
		});
		expect(mockFrom).not.toHaveBeenCalled();
	});

	it('inserts a HighlightReports row with the submitted page url, highlight text, reason and parsed highlight body', async () => {
		const result = await reportHighlight(null, makeFormData(VALID_FIELDS));

		expect(result).toEqual({ success: true });
		expect(mockFrom).toHaveBeenCalledWith('HighlightReports');
		expect(mockInsert).toHaveBeenCalledWith({
			page_url: VALID_FIELDS.pageUrl,
			highlight_text: VALID_FIELDS.highlightText,
			reason: VALID_FIELDS.reason,
			highlight_body: { descriptor: { type: 'test' } }
		});
	});

	it('logs the error with metadata and returns a failure state when the Supabase insert fails', async () => {
		const consoleErrorSpy = vi
			.spyOn(console, 'error')
			.mockImplementation(() => {});
		mockInsert.mockReturnValue({
			then: (
				resolve: (v: { data: null; error: { message: string } }) => unknown
			) =>
				Promise.resolve({ data: null, error: { message: 'boom' } }).then(
					resolve
				)
		});

		const result = await reportHighlight(null, makeFormData(VALID_FIELDS));

		expect(result).toEqual({
			success: false,
			error: 'Failed to submit report'
		});
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			'Failed to save highlight report',
			expect.objectContaining({
				pageUrl: VALID_FIELDS.pageUrl,
				highlightText: VALID_FIELDS.highlightText
			})
		);

		consoleErrorSpy.mockRestore();
	});
});
