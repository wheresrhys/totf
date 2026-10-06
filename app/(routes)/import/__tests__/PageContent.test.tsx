import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	render,
	screen,
	fireEvent,
	waitFor,
	cleanup
} from '@testing-library/react';
import { ImportPageContent } from '../PageContent';
import type { ImportMessage } from '@/app/api/import/route';

// `UnrecognisedLocationsReview` (#1080) fetches/resolves via these actions on
// mount/submit — mocked here since this suite renders the full `ImportPageContent`
// tree, not just the review component in isolation (see
// `app/components/pages/import/__tests__/UnrecognisedLocationsReview.test.tsx`
// for its own behaviour).
const { mockFetchGroupLocations, mockResolveUnrecognisedLocations } =
	vi.hoisted(() => ({
		mockFetchGroupLocations: vi.fn(),
		mockResolveUnrecognisedLocations: vi.fn()
	}));

vi.mock('@/app/actions/locations', () => ({
	fetchGroupLocations: mockFetchGroupLocations,
	resolveUnrecognisedLocations: mockResolveUnrecognisedLocations
}));

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
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe('ImportPageContent', () => {
	describe('unrecognised_locations message', () => {
		it('renders UnrecognisedLocationsReview with the reported names', async () => {
			mockFetchGroupLocations.mockResolvedValue([]);
			mockImportResponse([
				{ type: 'unrecognised_locations', locations: ['CES972', 'Reedbed'] }
			]);
			render(<ImportPageContent />);

			uploadCsv();

			await waitFor(() => {
				expect(
					screen.getByTestId('unrecognised-locations-review')
				).toBeTruthy();
			});
			expect(
				screen.getByTestId('unrecognised-location-row-CES972')
			).toBeTruthy();
			expect(
				screen.getByTestId('unrecognised-location-row-Reedbed')
			).toBeTruthy();
		});

		it('returns to the idle upload form once the review is resolved successfully', async () => {
			mockFetchGroupLocations.mockResolvedValue([]);
			mockResolveUnrecognisedLocations.mockResolvedValue({ success: true });
			mockImportResponse([
				{ type: 'unrecognised_locations', locations: ['CES972'] }
			]);
			render(<ImportPageContent />);

			uploadCsv();

			await waitFor(() => {
				expect(
					screen.getByTestId('unrecognised-locations-review')
				).toBeTruthy();
			});

			fireEvent.submit(
				screen
					.getByRole('button', { name: 'Save and continue' })
					.closest('form')!
			);

			await waitFor(() => {
				expect(
					screen.queryByTestId('unrecognised-locations-review')
				).toBeNull();
			});
			expect(screen.getByRole('button', { name: 'Import' })).toBeTruthy();
		});
	});
});
