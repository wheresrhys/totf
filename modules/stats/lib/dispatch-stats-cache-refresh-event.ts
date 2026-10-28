import { processStatsCacheRefreshWindowJob } from '@/app/api/queues/stats-cache-refresh-window/route';
import type { StatsCacheRefreshEvent } from '../stats-cache-refresh-events';
import { getEventDispatcher } from '@/app/lib/queue-dispatch';

const STATS_CACHE_REFRESH_WINDOW_TOPIC = 'stats-cache-refresh-window';
const STATS_CACHE_REFRESH_DISPATCH_MODE_ENV_VAR = 'STATS_CACHE_REFRESH_DISPATCH_MODE'

export const dispatchStatsCacheRefreshEvent = getEventDispatcher<StatsCacheRefreshEvent>(
  STATS_CACHE_REFRESH_WINDOW_TOPIC,
  STATS_CACHE_REFRESH_DISPATCH_MODE_ENV_VAR,
  processStatsCacheRefreshWindowJob
)

