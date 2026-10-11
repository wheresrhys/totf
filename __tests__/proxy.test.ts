import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';
import { REQUEST_PATHNAME_HEADER } from '../app/lib/request-pathname';

const originalVercelEnv = process.env.VERCEL_ENV;

afterEach(() => {
	process.env.VERCEL_ENV = originalVercelEnv;
});

describe('proxy', () => {
	it('stamps the request pathname header for any request', () => {
		const request = new NextRequest('https://example.test/group/alpha/summary');

		const response = proxy(request);

		// `NextResponse.next({ request: { headers } })` doesn't carry the
		// override on its own `.headers` under the header's own name — Next
		// encodes it as `x-middleware-request-<name>`, declared via
		// `x-middleware-override-headers`, for the framework to apply to the
		// downstream render. Confirmed against the real NextResponse shape
		// rather than assumed.
		expect(response.headers.get('x-middleware-override-headers')).toContain(
			REQUEST_PATHNAME_HEADER
		);
		expect(
			response.headers.get(`x-middleware-request-${REQUEST_PATHNAME_HEADER}`)
		).toBe('/group/alpha/summary');
	});

	describe('qa cookie activation on /_highlights (#1122)', () => {
		it('sets the qa cookie on the response when visiting /_highlights in production', () => {
			process.env.VERCEL_ENV = 'production';
			const request = new NextRequest('https://example.test/_highlights');

			const response = proxy(request);

			expect(response.cookies.get('qa')?.value).toBe('true');
		});

		it("sets the qa cookie on the request too, so the same request's render sees it immediately", () => {
			process.env.VERCEL_ENV = 'production';
			const request = new NextRequest('https://example.test/_highlights');

			proxy(request);

			expect(request.cookies.get('qa')?.value).toBe('true');
		});

		it('does not set the qa cookie when not in production', () => {
			process.env.VERCEL_ENV = 'preview';
			const request = new NextRequest('https://example.test/_highlights');

			const response = proxy(request);

			expect(response.cookies.get('qa')).toBeUndefined();
			expect(request.cookies.get('qa')).toBeUndefined();
		});

		it('does not set the qa cookie for any other path', () => {
			process.env.VERCEL_ENV = 'production';
			const request = new NextRequest('https://example.test/summary');

			const response = proxy(request);

			expect(response.cookies.get('qa')).toBeUndefined();
			expect(request.cookies.get('qa')).toBeUndefined();
		});
	});
});
