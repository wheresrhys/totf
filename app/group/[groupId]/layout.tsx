import { notFound, redirect } from 'next/navigation';
import { getGroupCookie } from '@/app/actions/group-cookie';

export default async function CrossGroupLayout({
	children,
	params
}: {
	children: React.ReactNode;
	params: Promise<{ groupId: string }>;
}) {
	const { groupId } = await params;
	const viewedGroupId = Number(groupId);
	const loggedInGroupId = await getGroupCookie();

	if (!loggedInGroupId) {
		redirect('/');
	}

	if (viewedGroupId === loggedInGroupId) {
		redirect('/');
	}

	// GroupDataSharing check added in PR #250
	notFound();
}
