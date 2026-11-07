// Online Reset: upstream Elmo sent CLI events and newsletter signups to its own
// PostHog project with a hard-coded key. Both are removed; exports are kept.
export async function trackCliEvent(
	_configDir: string,
	_eventName: string,
	_properties?: Record<string, string | number | boolean | undefined>,
	_personProperties?: Record<string, string | number | boolean | undefined>,
): Promise<void> {}

export async function submitNewsletterSignup(_configDir: string, _email: string): Promise<void> {}
