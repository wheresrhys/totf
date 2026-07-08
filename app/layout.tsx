import type { Metadata } from 'next';
import './globals.css';
import GlobalNav from './components/layout/GlobalNav';
import LoadFlyonUI from './components/layout/LoadFlyonUI';
import { Suspense } from 'react';
import { supabase, catchSupabaseErrors } from '@/lib/supabase';
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

export async function AuthorisedView({
	children
}: {
	children: React.ReactNode;
}) {
	const [initialGroupId, groups] = await Promise.all([
		getGroupCookie(),
		fetchRingingGroups()
	]);

	if (!initialGroupId) {
		return <LoginModal groups={groups} />;
	}

	const selectedGroup = groups.find((g) => g.id === initialGroupId)!;

	return (
		<Suspense>
			<RingingGroupProvider initialGroupId={initialGroupId}>
				<GlobalNav groups={[selectedGroup]} selectedGroupId={initialGroupId} />
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
