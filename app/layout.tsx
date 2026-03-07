import type { Metadata } from 'next';
import './globals.css';
import GlobalNav from './components/layout/GlobalNav';
import LoadFlyonUI from './components/layout/LoadFlyonUI';
import { Suspense } from 'react';
import { supabase, catchSupabaseErrors } from '@/lib/supabase';
import { getGroupId } from '@/lib/group-auth';

export const metadata: Metadata = {
	title: 'Top of the Flocks',
	description: 'Leaderboard for bird ringing data'
};

type RingingGroup = { id: number; group_name: string };

async function fetchRingingGroups(): Promise<RingingGroup[]> {
	return supabase
		.from('RingingGroups')
		.select('id, group_name')
		.order('group_name')
		.then(catchSupabaseErrors) as Promise<RingingGroup[]>;
}

export default async function RootLayout({
	children
}: Readonly<{
	children: React.ReactNode;
}>) {
	const [groups, selectedGroupId] = await Promise.all([
		fetchRingingGroups(),
		getGroupId()
	]);

	return (
		<html lang="en">
			<body>
				<GlobalNav groups={groups} selectedGroupId={selectedGroupId} />
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
