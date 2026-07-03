import { redirect } from 'next/navigation';
import { getGroupCookie } from '@/app/actions/group-cookie';

export default async function CrossGroupLayout({
	children
}: {
	children: React.ReactNode;
	params: Promise<{ groupId: string }>;
}) {
	const loggedInGroupId = await getGroupCookie();

	if (!loggedInGroupId) {
		redirect('/');
	}

	// Cross-group access control (GroupDataSharing check) added in PR #250
	return children;
}
