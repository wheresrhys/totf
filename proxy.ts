import { NextResponse, type NextRequest } from 'next/server';
import { REQUEST_PATHNAME_HEADER } from '@/app/lib/request-pathname';

// Server Components can't read the current request's full pathname on their
// own (a layout only ever receives `params` for its own position in the
// route tree, never a deeper static segment) — stamping it onto a request
// header here is the standard way to make it savailable downstream via
// `next/headers`. Scoped to `/group/**`, the only subtree that currently
// needs a pathname-aware decision (the root layout's public summary-subtree
// gate, `lib/public-group-access.ts`, #770).
export function proxy(request: NextRequest) {
	const requestHeaders = new Headers(request.headers);
	requestHeaders.set(REQUEST_PATHNAME_HEADER, request.nextUrl.pathname);
	return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
	matcher: ['/group/:path*']
};
