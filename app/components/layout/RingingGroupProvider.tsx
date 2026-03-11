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
	children
}: {
	children: React.ReactNode;
}) {
	// this can never actually be accessed in the app when unset, but using 0
	// rather than null here just makes the type system happier
	const [ringingGroup, setRingingGroup] = useState<number>(0);

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
