import type { Metadata } from 'next';
import './globals.css';
import GlobalNav from './components/layout/GlobalNav';
import LoadFlyonUI from './components/layout/LoadFlyonUI';
import { Suspense } from 'react';
import { supabase, catchSupabaseErrors } from '@/lib/supabase';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { RingingGroupProvider } from './components/layout/RingingGroupProvider';
import { getGroupCookie } from './actions/group-cookie';
import { LoginModal } from './components/layout/LoginModal';
export const metadata: Metadata = {
	title: 'Top of the Flocks',
	description: 'Leaderboard for bird ringing data'
};
import type { RingingGroupRow } from './models/db';

async function fetchRingingGroups(): Promise<RingingGroupRow[]> {
	return supabase
		.from('RingingGroups')
		.select('id, group_name')
		.order('group_name')
		.then(catchSupabaseErrors) as Promise<RingingGroupRow[]>;
}

async function fetchAccessibleGroups(
	allGroups: RingingGroupRow[]
): Promise<RingingGroupRow[]> {
	const authenticatedClient = await getAuthenticatedSupabaseClient();
	const sharingRows = (await authenticatedClient
		.from('GroupDataSharing')
		.select('granter_group_id')
		.then(catchSupabaseErrors)) as { granter_group_id: number }[];

	if (!sharingRows || sharingRows.length === 0) return [];
	const accessibleIds = new Set(sharingRows.map((r) => r.granter_group_id));
	return allGroups.filter((g) => accessibleIds.has(g.id));
}

async function AuthorisedView({ children }: { children: React.ReactNode }) {
	const [loggedInGroupId, allGroups] = await Promise.all([
		getGroupCookie(),
		fetchRingingGroups()
	]);

	if (!loggedInGroupId) {
		return <LoginModal groups={allGroups} />;
	}

	const ownGroup = allGroups.find((g) => g.id === loggedInGroupId)!;
	const accessibleGroups = await fetchAccessibleGroups(allGroups);

	return (
		<Suspense>
			<RingingGroupProvider initialGroupId={loggedInGroupId}>
				<GlobalNav
					groups={[ownGroup, ...accessibleGroups]}
					loggedInGroupId={loggedInGroupId}
				/>
				{children}
			</RingingGroupProvider>
		</Suspense>
	);
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
