'use client';
import { useRouter } from 'next/navigation';

export function RingSearchForm({
	q,
	buttonText = 'Search'
}: {
	q?: string;
	buttonText?: string;
}) {
	const router = useRouter();
	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const formData = new FormData(e.target as HTMLFormElement);
		const ring = formData.get('ring') as string;
		router.push(`/bird?q=${ring}`);
	};
	return (
		<form
			name="ring-search-form"
			className="flex gap-2"
			onSubmit={handleSubmit}
		>
			<input
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
