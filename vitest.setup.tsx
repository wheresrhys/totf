import { vi, afterAll } from 'vitest';
import React, { ReactNode, act } from 'react';
import { configMocks } from 'jsdom-testing-mocks';

// avoids happy-dom's fetch teardown which leads to all sorts of
// abort errors in tests
import { fetch as nodeFetch } from 'undici';
globalThis.fetch = nodeFetch as unknown as typeof fetch;

configMocks({ act, afterAll });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('./app/components/layout/BootstrapPageData');

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => {
    return <a href={ href } {...props
} > { children } </a>;
	},
}));

vi.mock('./app/actions/group-cookie', async () => {
  const { generateGroupJwt } = await import('./lib/jwt');
  return {
    getGroupCookie: vi.fn().mockResolvedValue(1),
    setGroupCookie: vi.fn().mockResolvedValue(undefined),
    getGroupJwt: vi.fn().mockImplementation(() => generateGroupJwt(1)),
  };
});

// Create mock functions that can be accessed in tests
export const mockPush = vi.fn();
export const mockReplace = vi.fn();
export const mockRefresh = vi.fn();
export const mockBack = vi.fn();
export const mockForward = vi.fn();
export const mockPrefetch = vi.fn();

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: mockRefresh,
    back: mockBack,
    forward: mockForward,
    prefetch: mockPrefetch,
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
