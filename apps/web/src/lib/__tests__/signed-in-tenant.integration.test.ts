/**
 * Online Reset (Packet 1b): signed-in actions run exactly as the server would
 * run them, inside the tenant scope the global middleware builds for a real
 * user (`runServerFnInTenant`), with nothing about the scope mocked. Covers the
 * client role over MCP, the four actions the tenant scope had broken, and the
 * signed-out default. All data is simulated.
 */
import { db, serviceDb } from "@workspace/lib/db/db";
import { countUsers, provisionUmbrellaOrg } from "@workspace/lib/db/provisioning";
import { brands, member, oauthClient, organization, user } from "@workspace/lib/db/schema";
import { orMemberBrandAccess } from "@workspace/lib/db/schema-or";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const verifyMcpAccessToken = vi.hoisted(() => vi.fn());
// Only the token's signature check is replaced; who the user is and what they
// may see is read from the database as in production.
vi.mock("@workspace/lib/auth/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@workspace/lib/auth/server")>()),
	verifyMcpAccessToken,
}));
vi.mock("@/lib/auth/server", () => ({ auth: {} }));
// An API key for the billing route tests; without one, the real resolver runs.
const keyState = vi.hoisted(() => ({ auth: null as unknown }));
vi.mock("@/lib/auth/api-auth", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/auth/api-auth")>();
	return {
		...actual,
		resolveApiAuth: vi.fn(async (request: Request) =>
			keyState.auth ? { auth: keyState.auth } : actual.resolveApiAuth(request),
		),
	};
});

const { resolveMcpAuth } = await import("@/lib/mcp/auth");
const { runToolInTenant } = await import("@/lib/mcp/server");
const { MCP_TOOLS } = await import("@/lib/mcp/tools");
const { tenantScopeForPrincipal } = await import("@/lib/auth/tenant-scope");
const { runServerFnInTenant, SIGNED_OUT_SYSTEM_FUNCTIONS } = await import("@/middleware/tenant");
const { findMcpClientSummary, insertBrandInOrganization, joinedOrganizationSlug, renameOrganization } = await import(
	"@/server/signed-in-core"
);
const { TAKEN_SLUG } = await import("@/lib/slug-errors");
const { loadBillingState } = await import("@/server/billing-core");
const billingRoute = await import("@/routes/api/v1/organizations/$organizationId/billing");

const ORG_A = "si-org-a";
const ORG_B = "si-org-b";
const BRAND_GRANTED = "si-brand-granted";
const BRAND_SIBLING = "si-brand-sibling";
const BRAND_B_SAME_NAME = "si-same-name";
const OWNER = "si-user-owner";
const MEMBER = "si-user-member";
const CLIENT = "si-user-client";
const NEWCOMER = "si-user-newcomer";
const OAUTH_CLIENT = "si-oauth-client";
const ALL_USERS = [OWNER, MEMBER, CLIENT, NEWCOMER];

const session = (id: string) => ({ user: { id, role: "user" } });
/** Any server function that is not on the signed-out allowlist. */
const ORDINARY_FN = { name: "listBrandsFn", filename: "src/server/brands.ts" };
const createdOrgIds: string[] = [];

async function cleanup() {
	const orgs = [ORG_A, ORG_B, ...createdOrgIds];
	await serviceDb.delete(oauthClient).where(eq(oauthClient.clientId, OAUTH_CLIENT));
	await serviceDb.delete(orMemberBrandAccess).where(inArray(orMemberBrandAccess.organizationId, orgs));
	await serviceDb.delete(brands).where(inArray(brands.organizationId, orgs));
	await serviceDb.delete(member).where(inArray(member.userId, ALL_USERS));
	await serviceDb.delete(organization).where(inArray(organization.id, orgs));
	await serviceDb.delete(user).where(inArray(user.id, ALL_USERS));
}

beforeAll(async () => {
	(process.env as Record<string, string | undefined>).DEPLOYMENT_MODE ??= "local";
	await cleanup();
	await serviceDb.insert(organization).values([
		{ id: ORG_A, name: "Simulated Agency A", slug: "si-agency-a", createdAt: new Date() },
		{ id: ORG_B, name: "Simulated Agency B", slug: "si-agency-b", createdAt: new Date() },
	]);
	await serviceDb
		.insert(user)
		.values(ALL_USERS.map((id) => ({ id, name: `Simulated ${id}`, email: `${id}@simulated.example` })));
	await serviceDb.insert(member).values([
		{ id: "si-m-owner", organizationId: ORG_A, userId: OWNER, role: "owner", createdAt: new Date() },
		{ id: "si-m-member", organizationId: ORG_A, userId: MEMBER, role: "member", createdAt: new Date() },
		{ id: "si-m-client", organizationId: ORG_A, userId: CLIENT, role: "client", createdAt: new Date() },
	]);
	await serviceDb.insert(brands).values([
		{ id: BRAND_GRANTED, name: "Simulated Granted Brand", website: "https://granted.example", organizationId: ORG_A },
		{ id: BRAND_SIBLING, name: "Simulated Sibling Brand", website: "https://sibling.example", organizationId: ORG_A },
		{ id: BRAND_B_SAME_NAME, name: "Si Same Name", website: "https://same.example", organizationId: ORG_B },
	]);
	await serviceDb.insert(orMemberBrandAccess).values({ organizationId: ORG_A, userId: CLIENT, brandId: BRAND_GRANTED });
	await serviceDb.insert(oauthClient).values({
		id: OAUTH_CLIENT,
		clientId: OAUTH_CLIENT,
		name: "Simulated MCP client",
		redirectUris: ["https://client.simulated.example/callback"],
		disabled: false,
	});
});

afterAll(cleanup);

describe("item 1: a client-role user over MCP (OAuth) sees only their granted brands", () => {
	async function signInOverMcp(userId: string) {
		verifyMcpAccessToken.mockResolvedValue({ sub: userId, client_id: OAUTH_CLIENT, exp: 1_900_000_000 });
		const resolved = await resolveMcpAuth(
			new Request("http://localhost/api/mcp", { method: "POST", headers: { Authorization: "Bearer oauth-token" } }),
		);
		if (!("auth" in resolved)) throw new Error(`sign-in failed: ${resolved.failure.message}`);
		return resolved.auth;
	}

	it("carries the brand restriction into the principal and its database scope", async () => {
		const auth = await signInOverMcp(CLIENT);
		expect(auth).toMatchObject({ kind: "user", organizationIds: [ORG_A], brandIds: [BRAND_GRANTED] });
		expect(tenantScopeForPrincipal(auth)).toMatchObject({
			organizationIds: [ORG_A],
			brandIds: [BRAND_GRANTED],
			restrictedOrganizationIds: [ORG_A],
			userId: CLIENT,
		});
	});

	it("lists only the granted brand and treats the sibling brand as not found", async () => {
		const auth = await signInOverMcp(CLIENT);
		const context = { auth, toolNames: MCP_TOOLS.map((t) => t.name) };
		const tool = (name: string) => MCP_TOOLS.find((t) => t.name === name) as (typeof MCP_TOOLS)[number];

		const listed = JSON.stringify(await runToolInTenant(tool("list_brands"), context, {}));
		expect(listed).toContain(BRAND_GRANTED);
		expect(listed).not.toContain(BRAND_SIBLING);
		await expect(runToolInTenant(tool("get_brand"), context, { brandId: BRAND_SIBLING })).rejects.toThrow(/not found/i);
		await expect(runToolInTenant(tool("get_brand"), context, { brandId: BRAND_GRANTED })).resolves.toMatchObject({
			id: BRAND_GRANTED,
		});
	});

	it("is bounded by the database too, not only by the tools' own checks", async () => {
		const auth = await signInOverMcp(CLIENT);
		const rawTool = {
			...MCP_TOOLS[0],
			run: async () => db.select({ id: brands.id }).from(brands),
		} as (typeof MCP_TOOLS)[number];
		const rows = (await runToolInTenant(rawTool, { auth, toolNames: [] }, {})) as Array<{ id: string }>;
		expect(rows.map((r) => r.id)).toEqual([BRAND_GRANTED]);
	});

	it("still gives an agency member over MCP every brand of their organization", async () => {
		const auth = await signInOverMcp(MEMBER);
		const rawTool = {
			...MCP_TOOLS[0],
			run: async () => db.select({ id: brands.id }).from(brands),
		} as (typeof MCP_TOOLS)[number];
		const rows = (await runToolInTenant(rawTool, { auth, toolNames: [] }, {})) as Array<{ id: string }>;
		expect(rows.map((r) => r.id).sort()).toEqual([BRAND_GRANTED, BRAND_SIBLING].sort());
	});
});

describe("item 3: signed-in actions that the tenant scope had broken", () => {
	it("renames an organization as its owner", async () => {
		const slug = await runServerFnInTenant(session(OWNER), ORDINARY_FN, () =>
			renameOrganization(
				{ id: ORG_A, slug: "si-agency-a" },
				{ name: "Simulated Agency A Renamed", slug: "si-agency-a2" },
			),
		);
		expect(slug).toBe("si-agency-a2");
		const [row] = await serviceDb.select().from(organization).where(eq(organization.id, ORG_A));
		expect(row).toMatchObject({ name: "Simulated Agency A Renamed", slug: "si-agency-a2" });
	});

	it("refuses a slug another tenant holds, without the owner being able to see that tenant", async () => {
		await expect(
			runServerFnInTenant(session(OWNER), ORDINARY_FN, () =>
				renameOrganization({ id: ORG_A, slug: "si-agency-a2" }, { name: "x", slug: "si-agency-b" }),
			),
		).rejects.toThrow(TAKEN_SLUG);
	});

	it("does not let a plain member rename the organization, even past the app check", async () => {
		await expect(
			runServerFnInTenant(session(MEMBER), ORDINARY_FN, () =>
				renameOrganization({ id: ORG_A, slug: "si-agency-a2" }, { name: "hijacked" }),
			),
		).rejects.toThrow(/Forbidden/);
	});

	it("reads the OAuth client for the MCP consent page", async () => {
		const summary = await runServerFnInTenant(session(MEMBER), ORDINARY_FN, () => findMcpClientSummary(OAUTH_CLIENT));
		expect(summary).toMatchObject({ name: "Simulated MCP client", redirectHosts: ["client.simulated.example"] });
	});

	it("returns the joined organization's slug after an invitation is accepted", async () => {
		const slug = await runServerFnInTenant(session(NEWCOMER), ORDINARY_FN, async () => {
			// The scope was built before the membership existed, as in a real accept.
			await expect(joinedOrganizationSlug(NEWCOMER, ORG_B)).rejects.toThrow(/no longer exists/);
			// What better-auth's acceptInvitation writes, on the system handle.
			await serviceDb.insert(member).values({
				id: "si-m-newcomer",
				organizationId: ORG_B,
				userId: NEWCOMER,
				role: "member",
				createdAt: new Date(),
			});
			return joinedOrganizationSlug(NEWCOMER, ORG_B);
		});
		expect(slug).toBe("si-agency-b");
	});

	it("creates a brand whose name matches another tenant's brand id, without a 500 or a hint", async () => {
		const created = await runServerFnInTenant(session(OWNER), ORDINARY_FN, () =>
			insertBrandInOrganization({
				organizationId: ORG_A,
				name: "Si Same Name",
				baseSlug: "si-same-name",
				website: "https://mine.example",
			}),
		);
		expect(created.brandId).toMatch(/^si-same-name-[0-9a-f]{8}$/);
		expect(created.brandSlug).toBe("si-same-name");
		const [row] = await serviceDb.select().from(brands).where(eq(brands.id, created.brandId));
		expect(row?.organizationId).toBe(ORG_A);
	});

	it("creates an organization (regression found while fixing the above)", async () => {
		const created = await runServerFnInTenant(session(MEMBER), ORDINARY_FN, () =>
			provisionUmbrellaOrg({ userId: MEMBER, name: "Si Simulated New Org" }),
		);
		createdOrgIds.push(created.orgId);
		const [membership] = await serviceDb
			.select({ role: member.role })
			.from(member)
			.where(eq(member.organizationId, created.orgId));
		expect(membership).toBeDefined();
	});
});

describe("item 6: signed-out server functions", () => {
	const visibleBrands = () => db.select({ id: brands.id }).from(brands).where(like(brands.id, "si-%"));

	it("run in an empty scope by default and see no tenant row", async () => {
		expect(await runServerFnInTenant(null, ORDINARY_FN, visibleBrands)).toEqual([]);
		expect(await runServerFnInTenant(null, undefined, visibleBrands)).toEqual([]);
	});

	it("has no allowlist: the four former entries run in the empty scope and still do their work", async () => {
		expect(SIGNED_OUT_SYSTEM_FUNCTIONS.size).toBe(0);
		const former = [
			{ name: "getClientConfig", filename: "src/server/config.ts" },
			{ name: "getEnvValidationStateFn", filename: "src/server/config.ts" },
			{ name: "getSession", filename: "src/lib/auth/session.ts" },
			{ name: "getConsentRegion", filename: "src/lib/consent-region.ts" },
		];
		for (const meta of former) expect(await runServerFnInTenant(null, meta, visibleBrands)).toEqual([]);
		// getClientConfig's only database read (the user count) is a system read on serviceDb.
		const users = await runServerFnInTenant(null, former[0], () => countUsers());
		expect(users).toBeGreaterThan(0);
	});
});

describe("Packet 1c item 4: billing is not shown to client users or brand-limited keys", () => {
	type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
	const handlers = (billingRoute.Route.options as unknown as { server: { handlers: Record<string, Handler> } }).server
		.handlers;
	const orgKey = (brandIds: string[] | null) => ({
		kind: "organization" as const,
		keyId: "si-key",
		name: "simulated key",
		organizationId: ORG_A,
		organizationName: "Simulated Agency A",
		scopes: new Set(["read" as const]),
		brandIds,
		createdAt: null,
		lastUsedAt: null,
		expiresAt: null,
		rateLimit: { limit: 1000, window: "minute" as const },
		rateLimitRemaining: null,
	});
	const callBilling = async (brandIds: string[] | null) => {
		keyState.auth = orgKey(brandIds);
		try {
			const request = new Request(`http://localhost/api/v1/organizations/${ORG_A}/billing`, {
				headers: { authorization: "Bearer simulated" },
			});
			return await (handlers.GET as Handler)({ request, params: { organizationId: ORG_A } });
		} finally {
			keyState.auth = null;
		}
	};

	it("refuses the billing settings data to a client user, as the server function runs it", async () => {
		await expect(
			runServerFnInTenant(session(CLIENT), ORDINARY_FN, () => loadBillingState(CLIENT, ORG_A)),
		).rejects.toThrow(/not available to client users/);
	});

	it("still gives it to the organization's owner and members", async () => {
		const owner = await runServerFnInTenant(session(OWNER), ORDINARY_FN, () => loadBillingState(OWNER, ORG_A));
		expect(owner.organization).toMatchObject({ id: ORG_A, role: "owner" });
		const asMember = await runServerFnInTenant(session(MEMBER), ORDINARY_FN, () => loadBillingState(MEMBER, ORG_A));
		expect(asMember.organization.role).toBe("member");
	});

	it("REST: refuses a brand-limited key with 403", async () => {
		const response = await callBilling([BRAND_GRANTED]);
		expect(response.status).toBe(403);
		expect(await response.text()).not.toContain("periodEnd");
	});

	it("REST: refuses a key limited to no brands with 403", async () => {
		expect((await callBilling([])).status).toBe(403);
	});

	it("REST: still serves a key that reaches the whole organization", async () => {
		const response = await callBilling(null);
		expect(response.status, await response.clone().text()).toBe(200);
		expect(await response.json()).toMatchObject({ organizationId: ORG_A });
	});

	it("MCP: refuses get_billing to a client user signed in over OAuth", async () => {
		verifyMcpAccessToken.mockResolvedValue({ sub: CLIENT, client_id: OAUTH_CLIENT, exp: 1_900_000_000 });
		const resolved = await resolveMcpAuth(
			new Request("http://localhost/api/mcp", { method: "POST", headers: { Authorization: "Bearer oauth-token" } }),
		);
		if (!("auth" in resolved)) throw new Error("sign-in failed");
		const tool = MCP_TOOLS.find((t) => t.name === "get_billing") as (typeof MCP_TOOLS)[number];
		await expect(
			runToolInTenant(tool, { auth: resolved.auth, toolNames: [] }, { organizationId: ORG_A }),
		).rejects.toThrow(/not available/);
	});
});
