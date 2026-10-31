import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StatsCacheRefreshEvent } from '@/modules/stats/types';
vi.mock('@vercel/queue', () => ({
	send: vi.fn().mockResolvedValue({ messageId: 'msg_1' }),

}));

vi.mock('@/app/api/queues/stats-cache-refresh-window/route', () => ({
	processStatsCacheRefreshWindowJob: vi.fn().mockResolvedValue(undefined)
}));

const EVENT = {
	importJobId: 42,
	rpcParams: { ringing_group_filter: 7 }
} as StatsCacheRefreshEvent;

const ORIGINAL_ENV = { ...process.env };

describe('dispatchStatsCacheRefreshEvent', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		delete process.env.VERCEL;
		delete process.env.STATS_CACHE_REFRESH_DISPATCH_MODE;
	});

	afterEach(() => {
		process.env = { ...ORIGINAL_ENV };
	});

	describe('inline mode', () => {
		it('calls the consumer handler directly when STATS_CACHE_REFRESH_DISPATCH_MODE=inline', async () => {
			process.env.STATS_CACHE_REFRESH_DISPATCH_MODE = 'inline';
			const { dispatchStatsCacheRefreshEvent } =
				await import('../dispatch-stats-cache-events');
			const { processStatsCacheRefreshWindowJob } =
				await import('../../../../app/api/queues/stats-cache-refresh-window/route');
			const { send } = await import('@vercel/queue');

			await dispatchStatsCacheRefreshEvent(EVENT);

			expect(processStatsCacheRefreshWindowJob).toHaveBeenCalledWith(EVENT);
			expect(send).not.toHaveBeenCalled();
		});

		it('defaults to inline when VERCEL and STATS_CACHE_REFRESH_DISPATCH_MODE are both unset', async () => {
			const { dispatchStatsCacheRefreshEvent } =
				await import('../dispatch-stats-cache-events');
			const { processStatsCacheRefreshWindowJob } =
				await import('../../../../app/api/queues/stats-cache-refresh-window/route');
			const { send } = await import('@vercel/queue');

			await dispatchStatsCacheRefreshEvent(EVENT);

			expect(processStatsCacheRefreshWindowJob).toHaveBeenCalledWith(EVENT);
			expect(send).not.toHaveBeenCalled();
		});
	});

	describe('queue mode', () => {
		it("calls @vercel/queue's send with the topic and event payload when STATS_CACHE_REFRESH_DISPATCH_MODE=queue", async () => {
			process.env.STATS_CACHE_REFRESH_DISPATCH_MODE = 'queue';
			const { dispatchStatsCacheRefreshEvent } =
				await import('../dispatch-stats-cache-events');
			const { processStatsCacheRefreshWindowJob } =
				await import('../../../../app/api/queues/stats-cache-refresh-window/route');
			const { send } = await import('@vercel/queue');

			await dispatchStatsCacheRefreshEvent(EVENT);

			expect(send).toHaveBeenCalledWith('stats-cache-refresh-window', EVENT);
			expect(processStatsCacheRefreshWindowJob).not.toHaveBeenCalled();
		});

		it('defaults to queue when VERCEL is set and STATS_CACHE_REFRESH_DISPATCH_MODE is unset', async () => {
			process.env.VERCEL = '1';
			const { dispatchStatsCacheRefreshEvent } =
				await import('../dispatch-stats-cache-events');
			const { processStatsCacheRefreshWindowJob } =
				await import('../../../../app/api/queues/stats-cache-refresh-window/route');
			const { send } = await import('@vercel/queue');

			await dispatchStatsCacheRefreshEvent(EVENT);

			expect(send).toHaveBeenCalledWith('stats-cache-refresh-window', EVENT);
			expect(processStatsCacheRefreshWindowJob).not.toHaveBeenCalled();
		});
	});
});
