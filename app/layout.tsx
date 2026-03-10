import type { Metadata } from 'next';
import './globals.css';
import GlobalNav from './components/layout/GlobalNav';
import LoadFlyonUI from './components/layout/LoadFlyonUI';
import { Suspense } from 'react';
import { supabase, catchSupabaseErrors } from '@/lib/supabase';
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

async function PopulatedNav() {
	const [groups] = await Promise.all([fetchRingingGroups()]);
	const selectedGroupId = groups[0].id;
	return <GlobalNav groups={groups} selectedGroupId={selectedGroupId} />;
}

export default function RootLayout({
	children
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body>
				<PopulatedNav />
				{children}
				<Suspense>
					<LoadFlyonUI />
				</Suspense>
				{/* Force icon imports */}
				<span className="hidden icon-[tabler--calendar] icon-[tabler--calendar-week] icon-[tabler--chevron-up] icon-[tabler--chevron-down] icon-[tabler--x] icon-[tabler--menu-2]"></span>
			</body>
		</html>
	);
}
