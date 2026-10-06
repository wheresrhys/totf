import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor,
	within,
	act
} from '@testing-library/react';
import { UnrecognisedLocationsReview } from '../UnrecognisedLocationsReview';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type {
	GroupLocationRow,
	ResolveUnrecognisedLocationsState
} from '@/app/actions/locations';

const { mockFetchGroupLocations, mockResolveUnrecognisedLocations } =
	vi.hoisted(() => ({
		mockFetchGroupLocations: vi.fn(),
		mockResolveUnrecognisedLocations: vi.fn()
	}));

vi.mock('@/app/actions/locations', () => ({
	fetchGroupLocations: mockFetchGroupLocations,
	resolveUnrecognisedLocations: mockResolveUnrecognisedLocations
}));

const viewedGroup: ViewedGroup = { id: 7, slug: 'alpha' };
const existingLocations: GroupLocationRow[] = [
	{ id: 1, location_name: 'Alpha Marsh' },
	{ id: 2, location_name: 'Beta Wood' }
];

async function renderReview(names: string[], onResolved = vi.fn()) {
	mockFetchGroupLocations.mockResolvedValue(existingLocations);
	const utils = render(
		<UnrecognisedLocationsReview
			names={names}
			viewedGroup={viewedGroup}
			onResolved={onResolved}
		/>
	);
	await waitFor(() =>
		expect(screen.queryByTestId('unrecognised-locations-loading')).toBeNull()
	);
	return { ...utils, onResolved };
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('UnrecognisedLocationsReview', () => {
	it('renders one row per unrecognised location name', async () => {
		await renderReview(['CES972', 'Reedbed']);

		expect(screen.getByTestId('unrecognised-location-row-CES972')).toBeTruthy();
		expect(
			screen.getByTestId('unrecognised-location-row-Reedbed')
		).toBeTruthy();
	});

	describe('new vs rename toggle', () => {
		it('defaults each row to "new location"', async () => {
			await renderReview(['CES972', 'Reedbed']);

			for (const name of ['CES972', 'Reedbed']) {
				const row = within(
					screen.getByTestId(`unrecognised-location-row-${name}`)
				);
				const newRadio = row.getByRole('radio', {
					name: 'New location'
				}) as HTMLInputElement;
				expect(newRadio.checked).toBe(true);
			}
			expect(screen.queryByRole('combobox')).toBeNull();
		});

		it('shows the existing-locations dropdown only when a row is switched to "rename"', async () => {
			await renderReview(['CES972', 'Reedbed']);

			const cesRow = within(
				screen.getByTestId('unrecognised-location-row-CES972')
			);
			fireEvent.click(
				cesRow.getByRole('radio', { name: 'Rename of an existing location' })
			);

			expect(cesRow.getByRole('combobox')).toBeTruthy();
			expect(
				within(
					screen.getByTestId('unrecognised-location-row-Reedbed')
				).queryByRole('combobox')
			).toBeNull();
		});
	});

	describe('submitting', () => {
		it('calls resolveUnrecognisedLocations with one decision per row', async () => {
			mockResolveUnrecognisedLocations.mockResolvedValue({
				success: true
			} satisfies ResolveUnrecognisedLocationsState);
			await renderReview(['CES972', 'Reedbed']);

			const cesRow = within(
				screen.getByTestId('unrecognised-location-row-CES972')
			);
			fireEvent.click(
				cesRow.getByRole('radio', { name: 'Rename of an existing location' })
			);
			fireEvent.change(cesRow.getByRole('combobox'), {
				target: { value: '2' }
			});

			fireEvent.submit(
				screen
					.getByRole('button', { name: 'Save and continue' })
					.closest('form')!
			);

			await waitFor(() => {
				expect(mockResolveUnrecognisedLocations).toHaveBeenCalled();
			});
			const formData = mockResolveUnrecognisedLocations.mock
				.calls[0][1] as FormData;
			expect(formData.get('viewed_group_id')).toBe('7');
			const decisions = JSON.parse(formData.get('decisions') as string);
			expect(decisions).toEqual([
				{ name: 'CES972', kind: 'rename', existingLocationId: 2 },
				{ name: 'Reedbed', kind: 'new' }
			]);
		});

		it('shows a loading state while the submission is pending', async () => {
			let resolveSubmit!: (value: ResolveUnrecognisedLocationsState) => void;
			mockResolveUnrecognisedLocations.mockReturnValue(
				new Promise((resolve) => {
					resolveSubmit = resolve;
				})
			);
			await renderReview(['CES972']);

			fireEvent.submit(
				screen
					.getByRole('button', { name: 'Save and continue' })
					.closest('form')!
			);

			await waitFor(() => {
				expect(document.querySelector('.loading-spinner')).not.toBeNull();
			});

			await act(async () => {
				resolveSubmit({ success: true });
			});
		});

		it('shows an inline error and keeps the review open on failure', async () => {
			mockResolveUnrecognisedLocations.mockResolvedValue({
				success: false,
				error: 'Malformed location decision'
			} satisfies ResolveUnrecognisedLocationsState);
			const { onResolved } = await renderReview(['CES972']);

			fireEvent.submit(
				screen
					.getByRole('button', { name: 'Save and continue' })
					.closest('form')!
			);

			await waitFor(() => {
				expect(screen.getByText('Malformed location decision')).toBeTruthy();
			});
			expect(onResolved).not.toHaveBeenCalled();
			expect(screen.getByTestId('unrecognised-locations-review')).toBeTruthy();
		});

		it('calls onResolved on success', async () => {
			mockResolveUnrecognisedLocations.mockResolvedValue({
				success: true
			} satisfies ResolveUnrecognisedLocationsState);
			const { onResolved } = await renderReview(['CES972']);

			fireEvent.submit(
				screen
					.getByRole('button', { name: 'Save and continue' })
					.closest('form')!
			);

			await waitFor(() => {
				expect(onResolved).toHaveBeenCalled();
			});
		});
	});
});
