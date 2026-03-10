'use client';
import { createContext, useContext, useState } from 'react';

const RingingGroupContext = createContext<{
	ringingGroup: number | null;
	setRingingGroup: (groupId: number) => void;
}>({
	ringingGroup: null,
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
	return ctx.setRingingGroup;
}

export function RingingGroupProvider({
	children
}: {
	children: React.ReactNode;
}) {
	const [ringingGroup, setRingingGroup] = useState<number | null>(null);

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
