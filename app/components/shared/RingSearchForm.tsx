'use client';
import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { resolveRingSearchDestination } from '@/app/actions/ring-search';

export function RingSearchForm({
	q,
	buttonText = 'Search',
	searchInputRef
}: {
	q?: string;
	buttonText?: string;
	searchInputRef?: React.RefObject<HTMLInputElement>;
}) {
	const router = useRouter();
	// Guards against a slower earlier search's destination resolving after a
	// later one and clobbering the navigation it already applied — each
	// submit only navigates if it's still the most recent one by the time its
	// destination resolves.
	const latestSearchId = useRef(0);
	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const formData = new FormData(e.target as HTMLFormElement);
		const ring = formData.get('ring') as string;
		const searchId = ++latestSearchId.current;
		// Resolve the destination (bird page on an exact match, fuzzy-results
		// page otherwise) here, rather than always navigating to `/search?q=...`
		// and relying on that page's Server Component to redirect — see #950.
		const { path } = await resolveRingSearchDestination(ring);
		if (searchId !== latestSearchId.current) {
			return;
		}
		router.push(path);
	};
	return (
		<form
			name="ring-search-form"
			className="flex gap-2"
			onSubmit={handleSubmit}
		>
			<input
				ref={searchInputRef}
				className="input input-bordered"
				type="text"
				name="ring"
				id="ring"
				aria-label="ring number"
				placeholder="Search by ring"
				defaultValue={q}
			/>
			<button className="btn btn-primary" type="submit">
				{buttonText}
			</button>
		</form>
	);
}
