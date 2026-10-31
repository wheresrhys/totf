import {
	describe,
	it,
	expect,
	vi,
	beforeEach,
	afterEach,
	type Mock
} from 'vitest';
import { getEventDispatcher } from '../queue-dispatch';

vi.mock('@vercel/queue', () => ({
	send: vi.fn().mockResolvedValue({ messageId: 'msg_1' })
}));

const TOPIC = 'arbitrary-topic';
const DISPATCH_MODE_ENV_VAR = 'ARBITRARY_DISPATCH_MODE';
const EVENT = { foo: 'bar' };

const ORIGINAL_ENV = { ...process.env };

describe('getEventDispatcher', () => {
	let callback: Mock<(event: unknown) => Promise<void>>;

	beforeEach(() => {
		vi.clearAllMocks();
		delete process.env.VERCEL;
		delete process.env[DISPATCH_MODE_ENV_VAR];
		callback = vi.fn(async () => {});
	});

	afterEach(() => {
		process.env = { ...ORIGINAL_ENV };
	});

	describe('inline mode', () => {
		it('calls the given callback directly when the dispatch-mode env var is set to inline', async () => {
			process.env[DISPATCH_MODE_ENV_VAR] = 'inline';
			const dispatch = getEventDispatcher(
				TOPIC,
				DISPATCH_MODE_ENV_VAR,
				callback
			);
			const { send } = await import('@vercel/queue');

			await dispatch(EVENT);

			expect(callback).toHaveBeenCalledWith(EVENT);
			expect(send).not.toHaveBeenCalled();
		});

		it('defaults to inline when VERCEL and the dispatch-mode env var are both unset', async () => {
			const dispatch = getEventDispatcher(
				TOPIC,
				DISPATCH_MODE_ENV_VAR,
				callback
			);
			const { send } = await import('@vercel/queue');

			await dispatch(EVENT);

			expect(callback).toHaveBeenCalledWith(EVENT);
			expect(send).not.toHaveBeenCalled();
		});
	});

	describe('queue mode', () => {
		it("calls @vercel/queue's send with the given topic and event payload when the dispatch-mode env var is set to queue", async () => {
			process.env[DISPATCH_MODE_ENV_VAR] = 'queue';
			const dispatch = getEventDispatcher(
				TOPIC,
				DISPATCH_MODE_ENV_VAR,
				callback
			);
			const { send } = await import('@vercel/queue');

			await dispatch(EVENT);

			expect(send).toHaveBeenCalledWith(TOPIC, EVENT);
			expect(callback).not.toHaveBeenCalled();
		});

		it('defaults to queue when VERCEL is set and the dispatch-mode env var is unset', async () => {
			process.env.VERCEL = '1';
			const dispatch = getEventDispatcher(
				TOPIC,
				DISPATCH_MODE_ENV_VAR,
				callback
			);
			const { send } = await import('@vercel/queue');

			await dispatch(EVENT);

			expect(send).toHaveBeenCalledWith(TOPIC, EVENT);
			expect(callback).not.toHaveBeenCalled();
		});
	});

	describe('configuring by topic / env var name', () => {
		it('reads the dispatch mode from the specific env var name it is given, not a fixed one', async () => {
			process.env.A_DISPATCH_MODE = 'inline';
			process.env.B_DISPATCH_MODE = 'queue';
			const dispatchA = getEventDispatcher(
				'topic-a',
				'A_DISPATCH_MODE',
				callback
			);
			const dispatchB = getEventDispatcher(
				'topic-b',
				'B_DISPATCH_MODE',
				callback
			);
			const { send } = await import('@vercel/queue');

			await dispatchA(EVENT);
			expect(callback).toHaveBeenCalledWith(EVENT);
			expect(send).not.toHaveBeenCalled();

			await dispatchB(EVENT);
			expect(send).toHaveBeenCalledWith('topic-b', EVENT);
		});
	});
});
