import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Page from '../page';
import spPageSnapshot from '@/test-fixtures/snapshots/fetchSpPageData.alpha.robin.json';
import type { FullFatPageData } from '../page';

const {
	mockGetAuthenticatedSupabaseClient,
	mockGetTopPeriodsByMetric,
	mockFetchPageOfBirds
} = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn(),
	mockGetTopPeriodsByMetric: vi.fn(),
	mockFetchPageOfBirds: vi.fn()
}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

vi.mock('@/app/actions/top-performers', () => ({
	getTopPeriodsByMetric: mockGetTopPeriodsByMetric
}));

vi.mock('@/app/actions/sp-data', () => ({
	fetchPageOfBirds: mockFetchPageOfBirds
}));

vi.mock('@/app/components/SpIndividualsTab', () => ({
	SpIndividualsTab: () => <div data-testid="sp-individuals-tab" />
}));

vi.mock('@/app/components/SpNotableRetrapsTab', () => ({
	SpNotableRetrapsTab: () => <div data-testid="sp-notable-retraps-tab" />
}));

vi.mock('@/app/components/SpStatsHistoryTab', () => ({
	SpStatsHistoryTab: () => <div data-testid="sp-stats-history-tab" />
}));

vi.mock('@/app/components/SpWeightWingTab', () => ({
	SpWeightWingTab: () => <div data-testid="sp-weight-wing-tab" />
}));

const { topSessions, birds, speciesStats } =
	spPageSnapshot as unknown as FullFatPageData;

function makeSpeciesClient() {
	const fromChain = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		single: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({
				data: { id: spPageSnapshot.speciesId },
				error: null
			}).then(resolve)
	};
	const rpcThenable = {
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data: [speciesStats], error: null }).then(resolve)
	};
	return {
		from: vi.fn().mockReturnValue(fromChain),
		rpc: vi.fn().mockReturnValue(rpcThenable)
	};
}

function renderSpeciesPage(speciesName = 'Robin') {
	return Page({
		params: Promise.resolve({ speciesName })
	});
}

describe('species detail page', () => {
	afterEach(() => {
		cleanup();
	});

	describe('with full data (Robin fixture)', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeSpeciesClient());
			mockGetTopPeriodsByMetric.mockResolvedValue(topSessions);
			mockFetchPageOfBirds.mockResolvedValue(birds);
		});

		it('renders all 4 tab buttons: Bird list, Retraps, Stats history, Size plot', async () => {
			render(await renderSpeciesPage());
			await screen.findByTestId('sp-individuals-tab');
			expect(screen.getByRole('button', { name: 'Bird list' })).toBeDefined();
			expect(screen.getByRole('button', { name: 'Retraps' })).toBeDefined();
			expect(
				screen.getByRole('button', { name: 'Stats history' })
			).toBeDefined();
			expect(screen.getByRole('button', { name: 'Size plot' })).toBeDefined();
		});

		describe('bird-list tab (default active)', () => {
			it('renders SpIndividualsTab', async () => {
				render(await renderSpeciesPage());
				await screen.findByTestId('sp-individuals-tab');
			});
		});

		describe('retraps tab (click to activate)', () => {
			it('renders SpNotableRetrapsTab after clicking Retraps button', async () => {
				render(await renderSpeciesPage());
				await screen.findByTestId('sp-individuals-tab');
				fireEvent.click(screen.getByRole('button', { name: 'Retraps' }));
				await screen.findByTestId('sp-notable-retraps-tab');
			});
		});

		describe('stats-history tab (click to activate)', () => {
			it('renders SpStatsHistoryTab after clicking Stats history button', async () => {
				render(await renderSpeciesPage());
				await screen.findByTestId('sp-individuals-tab');
				fireEvent.click(screen.getByRole('button', { name: 'Stats history' }));
				await screen.findByTestId('sp-stats-history-tab');
			});
		});

		describe('size-plot tab (click to activate)', () => {
			it('renders SpWeightWingTab after clicking Size plot button', async () => {
				render(await renderSpeciesPage());
				await screen.findByTestId('sp-individuals-tab');
				fireEvent.click(screen.getByRole('button', { name: 'Size plot' }));
				await screen.findByTestId('sp-weight-wing-tab');
			});
		});
	});

	describe('not authorised state (data has speciesId only, no birds)', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeSpeciesClient());
			mockGetTopPeriodsByMetric.mockResolvedValue([]);
			mockFetchPageOfBirds.mockResolvedValue([]);
		});

		it('renders "Not authorised to view any encounter data for this species" message', async () => {
			render(await renderSpeciesPage());
			await screen.findByText(
				'Not authorised to view any encounter data for this species'
			);
		});

		it('does not render tab buttons', async () => {
			render(await renderSpeciesPage());
			await screen.findByText(
				'Not authorised to view any encounter data for this species'
			);
			expect(screen.queryByRole('button', { name: 'Bird list' })).toBeNull();
		});

		it('does not render SpStats', async () => {
			render(await renderSpeciesPage());
			await screen.findByText(
				'Not authorised to view any encounter data for this species'
			);
			expect(screen.queryByTestId('headline-stats')).toBeNull();
		});
	});
});
