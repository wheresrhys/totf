'use client';

// Throwaway manual-testing harness for `TemporalFilterControls` (#1073). It
// deliberately skips the page/PageContent/dataFetcher split every real route
// follows — there's no data to fetch, the whole point is to poke the control in
// a browser and watch what it derives. Delete once the component is wired into
// a real page.
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { TemporalFilterControls } from '@/app/components/shared/TemporalFilterControls';
import {
	computeEffectiveDateRange,
	type TemporalSelection
} from '@/app/lib/temporal-filter';

const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025];

function parseSelectionFromSearchParams(
	searchParams: URLSearchParams
): TemporalSelection {
	const year = parseInt(searchParams.get('year') ?? '');
	const month = parseInt(searchParams.get('month') ?? '');
	return {
		...(year ? { year } : {}),
		...(month ? { month } : {}),
		...(searchParams.get('fromDate')
			? { fromDate: searchParams.get('fromDate') as string }
			: {}),
		...(searchParams.get('toDate')
			? { toDate: searchParams.get('toDate') as string }
			: {})
	};
}

function TemporalTestHarness() {
	// The control navigates by pushing query strings, so the URL is the single
	// source of truth for what it last produced — read it back rather than
	// duplicating the component's own state here.
	const selection = parseSelectionFromSearchParams(useSearchParams());
	const effectiveDateRange = computeEffectiveDateRange(selection);

	return (
		<main className="p-6 flex flex-col gap-6">
			<h1 className="text-xl">TemporalFilterControls manual test</h1>
			<TemporalFilterControls
				years={years}
				baseUrl="/temporal-test"
				initialSelection={selection}
			/>
			<section className="flex flex-col gap-2">
				<h2 className="text-lg">Selection (from the URL)</h2>
				<pre className="text-sm" data-testid="harness-selection">
					{JSON.stringify(selection, null, 2)}
				</pre>
				<h2 className="text-lg">computeEffectiveDateRange</h2>
				<pre className="text-sm" data-testid="harness-effective-date-range">
					{JSON.stringify(effectiveDateRange, null, 2)}
				</pre>
			</section>
		</main>
	);
}

export default function TemporalTestPage() {
	// `useSearchParams` needs a Suspense boundary above it or the whole route
	// opts into client-side rendering at build time.
	return (
		<Suspense>
			<TemporalTestHarness />
		</Suspense>
	);
}
