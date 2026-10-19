import { NextResponse, type NextRequest } from 'next/server';
import { REQUEST_PATHNAME_HEADER } from './app/lib/request-pathname';

const QA_COOKIE_NAME = 'qa';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Server Components can't read the current request's full pathname on their
// own (a layout only ever receives `params` for its own position in the
// route tree, never a deeper static segment) — stamping it onto a request
// header here is the standard way to make it savailable downstream via
// `next/headers`. Scoped to `/group/**`, the only subtree that currently
// needs a pathname-aware decision (the root layout's public summary-subtree
// gate, `lib/public-group-access.ts`, #770).
export function proxy(request: NextRequest) {
	// Visiting the unlinked /_highlights admin page (#1122) is itself the
	// activation step for the report-a-bad-highlight feature elsewhere in the
	// app — no more manually setting the cookie via devtools. Mutating
	// `request.cookies` (before the `new Headers(request.headers)` copy below)
	// means this same request's render of /_highlights — which reads the
	// cookie via `canReportHighlights()` to decide whether to 404 — sees it
	// immediately, rather than requiring a second visit. A Server Component
	// can't set cookies itself (only a Server Action or middleware can), which
	// is why this lives here rather than in the page. Only set in production
	// — the feature is production-only regardless, so there's no point
	// writing the cookie into a dev/preview browser session.
	const setsQaCookie =
		request.nextUrl.pathname === '/_highlights' &&
		process.env.VERCEL_ENV === 'production';
	if (setsQaCookie) {
		request.cookies.set(QA_COOKIE_NAME, 'true');
	}

	const requestHeaders = new Headers(request.headers);
	requestHeaders.set(REQUEST_PATHNAME_HEADER, request.nextUrl.pathname);
	const response = NextResponse.next({ request: { headers: requestHeaders } });

	if (setsQaCookie) {
		response.cookies.set(QA_COOKIE_NAME, 'true', {
			maxAge: ONE_YEAR_SECONDS,
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			path: '/'
		});
	}

	return response;
}

export const config = {
	matcher: ['/group/:path*', '/_highlights']
};
