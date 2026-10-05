import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImportPageContent } from '../PageContent';
import type { ImportMessage } from '@/app/api/import/route';

// Stands in for `POST /api/import`, streaming back the NDJSON messages the real
// route would send for this upload.
function mockImportResponse(messages: ImportMessage[]): void {
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			for (const message of messages) {
				controller.enqueue(encoder.encode(JSON.stringify(message) + '\n'));
			}
			controller.close();
		}
	});
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue(new Response(body, { status: 200 }))
	);
}

function uploadCsv(): void {
	const fileInput = document.querySelector(
		'input[type="file"]'
	) as HTMLInputElement;
	fireEvent.change(fileInput, {
		target: { files: [new File(['ring_no\nA123456'], 'data.csv')] }
	});
	fireEvent.click(screen.getByRole('button', { name: 'Import' }));
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('ImportPageContent', () => {
	describe('unrecognised_locations message', () => {
		it('renders a notice listing the unrecognised location names instead of the processing spinner', async () => {
			mockImportResponse([
				{ type: 'unrecognised_locations', locations: ['CES972', 'Reedbed'] }
			]);
			const { container } = render(<ImportPageContent />);

			uploadCsv();

			await waitFor(() => {
				expect(
					screen.getByText(/these locations were not recognised/)
				).toBeTruthy();
			});
			expect(screen.getByText(/CES972, Reedbed/)).toBeTruthy();
			expect(container.querySelector('.loading-spinner')).toBeNull();
		});
	});
});
