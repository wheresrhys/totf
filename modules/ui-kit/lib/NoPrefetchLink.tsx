import Link from 'next/link';

export function NoPrefetchLink({
	children,
	...props
}: React.ComponentProps<typeof Link>) {
	return (
		<Link {...props} prefetch={false}>
			{children}
		</Link>
	);
}
