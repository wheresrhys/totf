'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import { RingSearchForm } from '@/app/components/shared/RingSearchForm';
import { setGroup } from '@/app/actions/set-group';

type RingingGroup = { id: number; group_name: string };

export function NavItems({ classes }: { classes: string }) {
	return (
		<ul className={classes}>
			<li>
				<NoPrefetchLink href="/sessions">Sessions</NoPrefetchLink>
			</li>
			<li>
				<NoPrefetchLink href="/species">Species</NoPrefetchLink>
			</li>
		</ul>
	);
}

function GroupSwitcher({
	groups,
	selectedGroupId
}: {
	groups: RingingGroup[];
	selectedGroupId: number | null;
}) {
	const router = useRouter();

	async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
		const groupId = parseInt(e.target.value, 10);
		await setGroup(groupId);
		router.refresh();
	}

	return (
		<select
			className="select select-sm"
			value={selectedGroupId ?? ''}
			onChange={handleChange}
			aria-label="Select ringing group"
		>
			{selectedGroupId === null && (
				<option value="" disabled>
					Select group
				</option>
			)}
			{groups.map((group) => (
				<option key={group.id} value={group.id}>
					{group.group_name}
				</option>
			))}
		</select>
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

export default function GlobalNav({
	groups,
	selectedGroupId
}: {
	groups: RingingGroup[];
	selectedGroupId: number | null;
}) {
	const [showSearchForm, setShowSearchForm] = useState(false);
	const [showMobileNav, setShowMobileNav] = useState(false);
	const searchInputRef = useRef<HTMLInputElement>(null);

	const toggleNav = () => {
		setShowSearchForm(false);
		setShowMobileNav(!showMobileNav);
	};

	const toggleSearch = () => {
		setShowMobileNav(false);
		setShowSearchForm(!showSearchForm);
	};

	useEffect(() => {
		if (showSearchForm) {
			searchInputRef.current?.focus();
		}
	}, [showSearchForm]);
	return (
		<>
			<nav className="w-full shadow-base-300/20 shadow-sm">
				<div className="w-full flex px-6 py-4">
					<NoPrefetchLink
						className="link text-base-content link-neutral text-xl font-bold no-underline flex items-center gap-2 text-nowrap"
						href="/"
					>
						<span className="icon-[fluent-emoji-flat--blackbird] size-8"></span>
						Top of the Flocks
					</NoPrefetchLink>
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
						<div className="hidden md:flex items-center gap-2">
							<GroupSwitcher
								groups={groups}
								selectedGroupId={selectedGroupId}
							/>
							<RingSearchForm />
							<NavItems classes="menu menu-horizontal gap-2 p-0 text-base" />
						</div>
					</div>
				</div>
				<Expander id="mobile-nav" isExpanded={showMobileNav}>
					<div className="p-4 flex justify-end">
						<GroupSwitcher groups={groups} selectedGroupId={selectedGroupId} />
					</div>
					<NavItems classes="p-4 text-right *:p-2 *:mt-1 *:mb-1 *:hover:bg-base-200 *:rounded" />
				</Expander>
				<Expander id="ring-search-form-wrapper" isExpanded={showSearchForm}>
					<div className="p-4 pt-0">
						<RingSearchForm
							searchInputRef={
								searchInputRef as React.RefObject<HTMLInputElement>
							}
						/>
					</div>
				</Expander>
			</nav>
		</>
	);
}
