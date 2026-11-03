/**
 * Whether a promise has settled yet, and how — without awaiting it. Handlers are
 * attached synchronously, so a rejection tracked here is never an unhandled one.
 */
export function trackSettlement(promise: Promise<unknown>) {
	const settlement: { resolved: boolean; rejectedWith: unknown } = {
		resolved: false,
		rejectedWith: undefined
	};
	promise.then(
		() => {
			settlement.resolved = true;
		},
		(rejectionReason) => {
			settlement.rejectedWith = rejectionReason;
		}
	);
	return settlement;
}

/** Let every already-queued microtask run. */
export function settlePendingMicrotasks(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
