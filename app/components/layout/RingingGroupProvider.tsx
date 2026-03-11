'use client';
import { createContext, useContext, useState, useEffect } from 'react';
import { setGroupCookie, getGroupCookie } from '@/app/actions/group-cookie';

const RingingGroupContext = createContext<{
	ringingGroup: number;
	setRingingGroup: (groupId: number) => void;
}>({
	ringingGroup: 0,
	setRingingGroup: () => {}
});

export function useRingingGroup() {
	const ctx = useContext(RingingGroupContext);
	if (!ctx)
		throw new Error('useRingingGroup must be used within RingingGroupProvider');
	return ctx.ringingGroup;
}

export function useSetRingingGroup() {
	const ctx = useContext(RingingGroupContext);
	if (!ctx)
		throw new Error('useRingingGroup must be used within RingingGroupProvider');
	return async (groupId: number) => {
		ctx.setRingingGroup(groupId);
		await setGroupCookie(groupId);
	};
}

export function RingingGroupProvider({
	children,
	initialGroupId = null
}: {
	children: React.ReactNode;
	initialGroupId?: number | null;
}) {
	// Use server-fetched cookie as initial state to avoid hydration mismatch
	const [ringingGroup, setRingingGroup] = useState<number>(
		initialGroupId ?? 0
	);

	useEffect(() => {
		getGroupCookie().then((groupId) => {
			if (groupId) {
				setRingingGroup(groupId);
			}
		});
	}, []);
	return (
		<RingingGroupContext.Provider
			value={{
				ringingGroup,
				setRingingGroup
			}}
		>
			{children}
		</RingingGroupContext.Provider>
	);
}
