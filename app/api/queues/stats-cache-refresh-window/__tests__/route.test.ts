import { describe, it, expect, vi } from 'vitest';
import { processStatsCacheRefreshWindowJob } from '../route';

describe('processStatsCacheRefreshWindowJob', () => {
	it("logs the event's importJobId and rpcParams and resolves without throwing", async () => {
		const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

		const event = {
			importJobId: 42,
			rpcParams: {
				ringing_group_filter: 7,
				group_by_time_period: 'year' as const,
				year_filter: 2024
			}
		};

		await expect(
			processStatsCacheRefreshWindowJob(event)
		).resolves.toBeUndefined();
		expect(consoleLogSpy).toHaveBeenCalledWith(
			expect.stringContaining('stats-cache-refresh-window'),
			expect.objectContaining({
				importJobId: 42,
				rpcParams: event.rpcParams
			})
		);

		consoleLogSpy.mockRestore();
	});
});
