// Online Reset: upstream Elmo shipped a hard-coded PostHog key here. Product
// telemetry to a third party is removed; these exports stay so call sites compile.
export function trackWorkerEvent(
	_eventName: string,
	_properties?: Record<string, string | number | boolean | string[] | undefined>,
): void {}

export async function shutdownTelemetry(): Promise<void> {}
