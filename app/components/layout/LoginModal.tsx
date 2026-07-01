'use client';
import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loginGroup } from '@/app/actions/login';
import type { LoginState } from '@/app/actions/login';
import type { RingingGroupRow } from '@/app/models/db';

export function LoginModal({ groups }: { groups: RingingGroupRow[] }) {
	const router = useRouter();
	const [state, action, isPending] = useActionState<LoginState, FormData>(
		loginGroup,
		null
	);

	useEffect(() => {
		if (state?.success) {
			router.refresh();
		}
	}, [state, router]);

	const errorKey = state && !state.success ? state.error : 'no-error';

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
			<div className="bg-base-100 rounded-box shadow-xl p-6 w-full max-w-sm">
				<h2 className="font-bold text-lg mb-4">Login to your group</h2>
				<form action={action} className="flex flex-col gap-4">
					<select
						name="groupId"
						className="select select-bordered w-full"
						required
					>
						{groups.map((g) => (
							<option key={g.id} value={g.id}>
								{g.group_name}
							</option>
						))}
					</select>
					<input
						key={errorKey}
						type="password"
						name="password"
						className="input input-bordered w-full"
						placeholder="Password"
						required
					/>
					{state && !state.success && (
						<p className="text-error text-sm">{state.error}</p>
					)}
					<button
						type="submit"
						className="btn btn-primary"
						disabled={isPending}
					>
						{isPending ? (
							<span className="loading loading-spinner loading-sm" />
						) : (
							'Login'
						)}
					</button>
				</form>
			</div>
		</div>
	);
}
