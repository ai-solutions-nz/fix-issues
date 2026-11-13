import { describe, expect, it, vi } from "vitest";

// Online Reset (Packet 2b): demo promotes the hosted app once one exists.
// brand-links.ts ships empty; deployment.test.ts covers that state.
vi.mock("@workspace/config/brand-links", async (importOriginal) => ({
	...(await importOriginal<typeof import("@workspace/config/brand-links")>()),
	PUBLIC_APP_URL: "https://app.example.com",
}));

const { getDeployment, getDeploymentFeatures, resetDeploymentCache } = await import("./deployment");

describe("promotesCloud, with a hosted app configured", () => {
	it("is on for the demo only", () => {
		resetDeploymentCache();
		expect(getDeployment({ env: { DEPLOYMENT_MODE: "demo" } }).features.promotesCloud).toBe(true);
		for (const mode of ["local", "cloud"]) {
			resetDeploymentCache();
			expect(getDeploymentFeatures({ env: { DEPLOYMENT_MODE: mode } }).promotesCloud).toBe(false);
		}
	});

	it("is off for a self-hosted install made read-only", () => {
		resetDeploymentCache();
		expect(getDeployment({ env: { DEPLOYMENT_MODE: "local", READ_ONLY: "true" } }).features.promotesCloud).toBe(false);
	});
});
