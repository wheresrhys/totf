'use client';
import { useRef, useEffect, useReducer } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import { RingSearchForm } from '@/app/components/shared/RingSearchForm';
import { useSetRingingGroup } from './RingingGroupProvider';
import { logout } from '@/app/actions/logout';
import type { RingingGroupRow } from '@/app/models/db';
const moreLinks = [
	{ href: '/mistakes', label: 'Mistakes' },
	{ href: '/retraps', label: 'Retraps' },
	{ href: '/effort', label: 'Effort' },
	{ href: '/ring-sequences', label: 'Ring Sequences' },
	{ href: '/controls', label: 'Controls' }
];

export function DesktopNavItems({
	classes,
	moreExpanded,
	onMoreClick
}: {
	classes: string;
	moreExpanded: boolean;
	onMoreClick: () => void;
}) {
	return (
		<ul className={classes}>
			<li>
				<NoPrefetchLink href="/sessions">Sessions</NoPrefetchLink>
			</li>
			<li>
				<NoPrefetchLink href="/species">Species</NoPrefetchLink>
			</li>
			<li className="relative">
				<button type="button" className="cursor-pointer" onClick={onMoreClick}>
					More
					<span className="icon-[tabler--chevron-down] size-4 ml-1 inline-block align-middle"></span>
				</button>
				{moreExpanded && (
					<ul className="absolute left-0 top-full z-50 min-w-max bg-base-100 shadow-md rounded-md p-1 border border-base-content/10">
						{moreLinks.map(({ href, label }) => (
							<li key={href}>
								<NoPrefetchLink
									href={href}
									className="block px-4 py-2 hover:bg-base-200 rounded"
								>
									{label}
								</NoPrefetchLink>
							</li>
						))}
					</ul>
				)}
			</li>
		</ul>
	);
}

export function MobileNavItems({ classes }: { classes: string }) {
	return (
		<ul className={classes}>
			<li>
				<NoPrefetchLink href="/sessions">Sessions</NoPrefetchLink>
			</li>
			<li>
				<NoPrefetchLink href="/species">Species</NoPrefetchLink>
			</li>
			{moreLinks.map(({ href, label }) => (
				<li key={href}>
					<NoPrefetchLink href={href}>{label}</NoPrefetchLink>
				</li>
			))}
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

function GroupSwitcher({
	groups,
	selectedGroupId,
	onChange
}: {
	groups: RingingGroupRow[];
	selectedGroupId: number | null;
	onChange: () => void;
}) {
	const router = useRouter();
	const setRingingGroup = useSetRingingGroup();
	async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
		const groupId = parseInt(e.target.value, 10);
		await setRingingGroup(groupId);
		onChange();
		router.refresh();
	}

	if (groups.length === 1) {
		return null;
	}

	return (
		<select
			className="select select-bordered md:w-1/3"
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
type ExpanderId = 'search' | 'mobileNav' | 'userMenu' | 'moreMenu';
type ExpanderAction =
	| { type: 'toggle'; id: ExpanderId }
	| { type: 'collapseAll' }
	| { type: 'set'; id: ExpanderId; value: boolean };

function expanderReducer(
	state: Record<ExpanderId, boolean>,
	action: ExpanderAction
) {
	const falsyState = Object.fromEntries(
		Object.keys(state).map((id) => [id, false])
	) as Record<ExpanderId, boolean>;

	switch (action.type) {
		case 'toggle':
			return { ...falsyState, [action.id]: !state[action.id] };
		case 'set':
			return { ...falsyState, [action.id]: action.value };
		case 'collapseAll':
			return falsyState;
	}
}

export default function GlobalNav({
	groups,
	selectedGroupId
}: {
	groups: RingingGroupRow[];
	selectedGroupId: number | null;
}) {
	const pathname = usePathname();
	const router = useRouter();
	const setRingingGroup = useSetRingingGroup();
	const [expanders, expandersDispatch] = useReducer(expanderReducer, {
		search: false,
		mobileNav: false,
		moreMenu: false,
		userMenu: !selectedGroupId
	} as Record<ExpanderId, boolean>);
	const groupsCount = groups.length;
	const firstGroupId = groups[0].id;
	const searchInputRef = useRef<HTMLInputElement>(null);
	const selectedGroup = groups.find(
		(group) => group.id === selectedGroupId
	) as RingingGroupRow;

	// Reset expandable UI state when route changes
	useEffect(() => {
		expandersDispatch({
			type: 'set',
			id: 'userMenu',
			value: !selectedGroupId
		});
	}, [pathname, selectedGroupId]);

	useEffect(() => {
		if (groupsCount === 1 && selectedGroupId !== firstGroupId) {
			setRingingGroup(firstGroupId).then(() => {
				router.refresh();
			});
		}
	}, [groupsCount, firstGroupId, selectedGroupId, router, setRingingGroup]);

	useEffect(() => {
		if (expanders.search) {
			searchInputRef.current?.focus();
		}
	}, [expanders.search]);
	return (
		<>
			<nav className="w-full shadow-base-300/20 shadow-sm">
				<div className="w-full flex px-6 py-4">
					<NoPrefetchLink
						className="link text-base-content link-neutral text-xl font-bold no-underline flex items-center gap-2 text-nowrap"
						href="/"
					>
						<span className="mr-2 icon-[fluent-emoji-flat--blackbird] size-8 flex-shrink-0 flex-grow-0"></span>
						<span className="flex items-center gap-x-2 flex-wrap">
							<span>Top of the Flocks</span>
							{selectedGroupId ? (
								<span className="text-sm font-medium">
									{selectedGroup.group_name}
								</span>
							) : null}
						</span>
					</NoPrefetchLink>

					<div className="flex justify-end w-full gap-2 items-center">
						<div className="lg:hidden flex items-center gap-2">
							<button
								type="button"
								className="btn-sm btn-square"
								aria-controls="ring-search-form-wrapper"
								aria-label="Search for a ring number"
								onClick={() => {
									expandersDispatch({ type: 'toggle', id: 'search' });
								}}
							>
								<span className="icon-[tabler--search] collapse-open:hidden size-7"></span>
							</button>
						</div>
						<div className="md:hidden flex items-center gap-2">
							<button
								type="button"
								className="collapse-toggle btn btn-outline btn-secondary btn-sm btn-square"
								aria-controls="mobile-nav"
								aria-label="Toggle navigation"
								onClick={() => {
									expandersDispatch({ type: 'toggle', id: 'mobileNav' });
								}}
							>
								<span
									className={`${expanders.mobileNav ? 'icon-[tabler--x]' : 'icon-[tabler--menu-2]'}  collapse-open:hidden size-4`}
								></span>
							</button>
						</div>
						<div className="hidden lg:flex mr-2">
							<RingSearchForm />
						</div>
						<div className="hidden md:flex">
							<DesktopNavItems
								classes="menu menu-horizontal gap-2 p-0 text-base"
								moreExpanded={expanders.moreMenu}
								onMoreClick={() =>
									expandersDispatch({ type: 'toggle', id: 'moreMenu' })
								}
							/>
						</div>
						<button
							type="button"
							className="collapse-toggle btn btn-outline btn-secondary btn-sm btn-square"
							aria-controls="user-menu"
							aria-label="Toggle user menu"
							onClick={() => {
								expandersDispatch({ type: 'toggle', id: 'userMenu' });
							}}
						>
							<span className="icon-[tabler--users-group] size-4"></span>
						</button>
					</div>
				</div>
				<Expander id="mobile-nav" isExpanded={expanders.mobileNav}>
					<MobileNavItems classes="p-4 text-right *:p-2 *:mt-1 *:mb-1 *:hover:bg-base-200 *:rounded" />
				</Expander>
				<Expander id="ring-search-form-wrapper" isExpanded={expanders.search}>
					<div className="p-4 pt-0">
						<RingSearchForm
							searchInputRef={
								searchInputRef as React.RefObject<HTMLInputElement>
							}
						/>
					</div>
				</Expander>
				<Expander id="user-menu" isExpanded={expanders.userMenu}>
					<div className="p-4 pt-0 flex justify-end items-center gap-4">
						{groups.length > 1 && (
							<GroupSwitcher
								groups={groups}
								selectedGroupId={selectedGroupId}
								onChange={() => expandersDispatch({ type: 'collapseAll' })}
							/>
						)}
						<NoPrefetchLink
							href="/import"
							className="link link-secondary text-sm"
						>
							Import data
						</NoPrefetchLink>
						<form action={logout}>
							<button type="submit" className="link link-secondary text-sm">
								Log out
							</button>
						</form>
					</div>
				</Expander>
			</nav>
		</>
	);
}
