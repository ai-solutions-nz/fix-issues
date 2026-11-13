import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { API_DOCS_URL } from "@workspace/config/constants";

export const Route = createFileRoute("/api/v1/docs/")({
	beforeLoad: () => {
		// Online Reset: no public API docs yet (brand-links.ts); the in-app API settings page documents this instance.
		if (!API_DOCS_URL) throw notFound();
		throw redirect({ href: API_DOCS_URL });
	},
	component: () => null,
});
