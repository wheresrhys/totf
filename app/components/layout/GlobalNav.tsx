'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function RingSearchForm() {
	const router = useRouter();
	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const formData = new FormData(e.target as HTMLFormElement);
		const ring = formData.get('ring') as string;
		router.push(`/bird/${ring}`);
	};
	return (
		<form
			name="ring-search-form"
			className="flex gap-2 pt-0 p-4"
			onSubmit={handleSubmit}
		>
			<input
				className="input input-bordered"
				type="text"
				name="ring"
				id="ring"
				aria-label="ring number"
				placeholder="Search by ring"
			/>
			<button className="btn btn-primary" type="submit">
				Search
			</button>
		</form>
	);
}

export function NavItems({ classes }: { classes: string }) {
	return (
		<ul className={classes}>
			<li>
				<Link href="/sessions">Sessions</Link>
			</li>
			<li>
				<Link href="/species">Species</Link>
			</li>
		</ul>
	);
}

function Expander({
	id,
	children,
	isExpanded
}: {
	id: string;
	children: React.ReactNode;
	isExpanded: boolean;
}) {
	return (
		<div
			id={id}
			className={`${isExpanded ? '' : 'hidden'} collapse grow basis-full overflow-hidden w-full`}
		>
			{children}
		</div>
	);
}

export default function GlobalNav() {
	const [showSearchForm, setShowSearchForm] = useState(false);
	const [showMobileNav, setShowMobileNav] = useState(false);

	const toggleNav = () => {
		setShowSearchForm(false);
		setShowMobileNav(!showMobileNav);
	};

	const toggleSearch = () => {
		setShowSearchForm(!showSearchForm);
		setShowMobileNav(false);
	};

	return (
		<>
			<nav className="w-full shadow-base-300/20 shadow-sm">
				<div className="w-full flex px-6 py-4">
					<Link
						className="link text-base-content link-neutral text-xl font-bold no-underline flex items-center gap-2 text-nowrap"
						href="/"
					>
						<span className="icon-[fluent-emoji-flat--blackbird] size-8"></span>
						Top of the Flocks
					</Link>
					<div className="flex justify-end w-full gap-2 items-center">
						<div className="md:hidden flex items-center gap-2">
							<button
								type="button"
								className="btn-sm btn-square"
								aria-controls="ring-search-form-wrapper"
								aria-label="Search for a ring number"
								onClick={toggleSearch}
							>
								<span className="icon-[tabler--search] collapse-open:hidden size-7"></span>
							</button>
							<button
								type="button"
								className="collapse-toggle btn btn-outline btn-secondary btn-sm btn-square"
								aria-controls="mobile-nav"
								aria-label="Toggle navigation"
								onClick={toggleNav}
							>
								<span
									className={`${showMobileNav ? 'icon-[tabler--x]' : 'icon-[tabler--menu-2]'}  collapse-open:hidden size-4`}
								></span>
							</button>
						</div>
						<div className="hidden md:flex">
							<RingSearchForm />
							<NavItems classes="menu menu-horizontal gap-2 p-0 text-base" />
						</div>
					</div>
				</div>
				<Expander id="mobile-nav" isExpanded={showMobileNav}>
					<NavItems classes="p-4 text-right *:p-2 *:mt-1 *:mb-1 *:hover:bg-base-200 *:rounded" />
				</Expander>
				<Expander id="ring-search-form-wrapper" isExpanded={showSearchForm}>
					<RingSearchForm />
				</Expander>
			</nav>
		</>
	);
}
