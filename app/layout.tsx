import type { Metadata } from 'next';
import './globals.css';
import GlobalNav from './components/layout/GlobalNav';
import LoadFlyonUI from './components/layout/LoadFlyonUI';
import { Suspense } from 'react';
import { supabase, catchSupabaseErrors } from '@/lib/supabase';
import { RingingGroupProvider } from './components/layout/RingingGroupProvider';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { getGroupCookie } from './actions/group-cookie';
import { LoginModal } from './components/layout/LoginModal';
import { getRequestPathname } from '@/app/lib/request-pathname';
import { resolvePublicPageViewedGroupId } from '@/app/lib/auth/public-group-access';
import type {SupabaseClient} from '@supabase/supabase-js'
export const metadata: Metadata = {
	title: 'Top of the Flocks',
	description: 'Leaderboard for bird ringing data'
};
import type { RingingGroupRow } from './models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';

export type SimpleSpeciesRow = {
	id: number,
	species_name: string
}
const speciesNamesCache: Map<number, {
	expiry: number,
	species: SimpleSpeciesRow[]
}> = new Map();


async function fetchRingingGroups(): Promise<RingingGroupRow[]> {
	return supabase
		.from('RingingGroups')
		.select('id, group_name')
		.order('group_name')
		.then(catchSupabaseErrors) as Promise<RingingGroupRow[]>;
}

export async function fetchSpeciesNames(viewedGroup: ViewedGroup, supabase: SupabaseClient) {
	if (speciesNamesCache.has(viewedGroup.id)) {
		const cached = speciesNamesCache.get(viewedGroup.id);
		if (cached && cached.expiry > Date.now()) {
			return cached.species;
		}
	}
	const species = await (supabase
		.from('Species')
		.select('id, species_name, Birds!inner(species_id,ringing_group_ids)')
		.contains('Birds.ringing_group_ids', [viewedGroup.id])
		.then(catchSupabaseErrors)) as SimpleSpeciesRow[];

	speciesNamesCache.set(viewedGroup.id, {
		expiry: Date.now() + 1000 * 60 * 60,
		species
	})
	return species;
}

export async function AuthorisedView({
	children
}: {
	children: React.ReactNode;
}) {
	const pathname = await getRequestPathname();
	console.log({pathname})
	const [loggedInGroupId, groups] = await Promise.all([
		getGroupCookie(),
		fetchRingingGroups()
	]);

	if (loggedInGroupId) {
		const selectedGroup = groups.find((g) => g.id === loggedInGroupId)!;
		const speciesList = await fetchSpeciesNames(selectedGroup, await getAuthenticatedSupabaseClient())
		return (
			<Suspense>
				<RingingGroupProvider initialGroupId={loggedInGroupId}>
					<GlobalNav
						groups={[selectedGroup]}
						selectedGroupId={loggedInGroupId}
						speciesList={speciesList}
						expandBirdNav={pathname === '/'}
					/>
					{children}
				</RingingGroupProvider>
			</Suspense>
		);
	}

	// No session cookie — the only exception to the login gate is an
	// anonymous request for a group's public summary subtree (#770). There's
	// no logged-in group to track (RingingGroupProvider is skipped, same as
	// the removed group/[groupSlug] layout's `return children` did), but
	// GlobalNav still renders in `readOnly` mode so the visitor can see whose
	// data they're looking at — it hides every aspect that assumes a
	// logged-in group (switcher, import, logout, authenticated-only nav
	// links/search).

	const publicViewedGroupId = await resolvePublicPageViewedGroupId(pathname);
	if (publicViewedGroupId !== null) {
		const viewedGroup = groups.find((g) => g.id === publicViewedGroupId)!;
		const speciesList = await fetchSpeciesNames(viewedGroup, supabase)
		return (
			<Suspense>
				<GlobalNav
					groups={[viewedGroup]}
					selectedGroupId={publicViewedGroupId}
					speciesList={speciesList}
					readOnly
					expandBirdNav={pathname === '/'}
				/>
				{children}
			</Suspense>
		);
	}

	return <LoginModal groups={groups} />;
}

export default function RootLayout({
	children
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body>
				<Suspense>
					<AuthorisedView>{children}</AuthorisedView>
				</Suspense>
				<Suspense>
					<LoadFlyonUI />
				</Suspense>
				{/* Force icon imports */}
				<span className="hidden icon-[tabler--calendar] icon-[tabler--calendar-week] icon-[tabler--chevron-up] icon-[tabler--chevron-down] icon-[tabler--x] icon-[tabler--menu-2]"></span>
			</body>
		</html>
	);
}
